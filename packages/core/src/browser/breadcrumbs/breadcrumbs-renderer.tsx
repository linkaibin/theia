/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import * as React from 'react';
import { injectable, inject, postConstruct } from 'inversify';
import { ReactRenderer } from '../widgets';
import { Breadcrumb } from './breadcrumb';
import { Breadcrumbs } from './breadcrumbs';
import { BreadcrumbsService } from './breadcrumbs-service';
import { BreadcrumbRenderer } from './breadcrumb-renderer';
import PerfectScrollbar from 'perfect-scrollbar';
import URI from '../../common/uri';
import { Emitter, Event } from '../../common';
import { BreadcrumbPopupContainer } from './breadcrumb-popup-container';
import { DisposableCollection } from '../../common/disposable';
import { CorePreferences } from '../core-preferences';
import { Coordinate } from '../context-menu-renderer';

interface Cancelable {
    canceled: boolean;
}

@injectable()
export class BreadcrumbsRenderer extends ReactRenderer {

    @inject(BreadcrumbsService)
    protected readonly breadcrumbsService: BreadcrumbsService;

    @inject(BreadcrumbRenderer)
    protected readonly breadcrumbRenderer: BreadcrumbRenderer;

    @inject(CorePreferences)
    protected readonly corePreferences: CorePreferences;

    protected readonly onDidChangeActiveStateEmitter = new Emitter<boolean>();
    get onDidChangeActiveState(): Event<boolean> {
        return this.onDidChangeActiveStateEmitter.event;
    }

    protected uri: URI | undefined;
    protected breadcrumbs: Breadcrumb[] = [];
    protected popup: BreadcrumbPopupContainer | undefined;
    protected scrollbar: PerfectScrollbar | undefined;
    protected toDispose: DisposableCollection = new DisposableCollection();

    get active(): boolean {
        return !!this.breadcrumbs.length;
    }

    protected refreshCancellationMarker: Cancelable = { canceled: true };

    @postConstruct()
    init(): void {
        this.toDispose.push(this.onDidChangeActiveStateEmitter);
        this.toDispose.push(this.breadcrumbsService.onDidChangeBreadcrumbs(uri => {
            if (this.uri?.isEqual(uri)) {
                this.refresh(uri);
            }
        }));
        this.toDispose.push(this.corePreferences.onPreferenceChanged(change => {
            if (change.preferenceName === 'breadcrumbs.enabled') {
                this.refresh(this.uri);
            }
        }));
    }

    dispose(): void {
        super.dispose();
        this.toDispose.dispose();
        if (this.popup) { this.popup.dispose(); }
        if (this.scrollbar) {
            this.scrollbar.destroy();
            this.scrollbar = undefined;
        }
    }

    async refresh(uri?: URI): Promise<void> {
        this.refreshCancellationMarker.canceled = true;
        const currentCallCanceled = { canceled: false };
        this.refreshCancellationMarker = currentCallCanceled;
        let breadcrumbs: Breadcrumb[];
        if (uri && this.corePreferences['breadcrumbs.enabled']) {
            breadcrumbs = await this.breadcrumbsService.getBreadcrumbs(uri);
        } else {
            breadcrumbs = [];
        }
        if (currentCallCanceled.canceled) {
            return;
        }

        this.uri = uri;
        const wasActive = this.active;
        this.breadcrumbs = breadcrumbs;
        const isActive = this.active;
        if (wasActive !== isActive) {
            this.onDidChangeActiveStateEmitter.fire(isActive);
        }

        this.update();
    }

    protected update(): void {
        this.render();

        if (!this.scrollbar) {
            this.createScrollbar();
        } else {
            this.scrollbar.update();
        }
        this.scrollToEnd();
    }

    protected createScrollbar(): void {
        if (this.host.firstChild) {
            this.scrollbar = new PerfectScrollbar(this.host.firstChild as HTMLElement, {
                handlers: ['drag-thumb', 'keyboard', 'wheel', 'touch'],
                useBothWheelAxes: true,
                scrollXMarginOffset: 4,
                suppressScrollY: true
            });
        }
    }

    protected scrollToEnd(): void {
        if (this.host.firstChild) {
            const breadcrumbsHtmlElement = (this.host.firstChild as HTMLElement);
            breadcrumbsHtmlElement.scrollLeft = breadcrumbsHtmlElement.scrollWidth;
        }
    }

    protected doRender(): React.ReactNode {
        return <ul className={Breadcrumbs.Styles.BREADCRUMBS}>{this.renderBreadcrumbs()}</ul>;
    }

    protected renderBreadcrumbs(): React.ReactNode {
        return this.breadcrumbs.map(breadcrumb => this.breadcrumbRenderer.render(breadcrumb, this.togglePopup));
    }

    protected togglePopup = (breadcrumb: Breadcrumb, event: React.MouseEvent) => {
        event.stopPropagation();
        event.preventDefault();
        let openPopup = true;
        if (this.popup?.isOpen) {
            this.popup.dispose();

            // There is a popup open. If the popup is the popup that belongs to the currently clicked breadcrumb
            // just close the popup. If another breadcrumb was clicked, open the new popup immediately.
            openPopup = this.popup.breadcrumbId !== breadcrumb.id;
        } else {
            this.popup = undefined;
        }
        if (openPopup) {
            if (event.nativeEvent.target && event.nativeEvent.target instanceof HTMLElement) {
                const breadcrumbsHtmlElement = BreadcrumbsRenderer.findParentBreadcrumbsHtmlElement(event.nativeEvent.target as HTMLElement);
                if (breadcrumbsHtmlElement && breadcrumbsHtmlElement.parentElement && breadcrumbsHtmlElement.parentElement.lastElementChild) {
                    const position: Coordinate = BreadcrumbsRenderer.determinePopupAnchor(event.nativeEvent) || event.nativeEvent;
                    this.breadcrumbsService.openPopup(breadcrumb, position).then(popup => { this.popup = popup; });
                }
            }
        }
    };
}

export namespace BreadcrumbsRenderer {

    /**
     * Traverse upstream (starting with the HTML element `child`) to find a parent HTML element
     * that has the CSS class `Breadcrumbs.Styles.BREADCRUMB_ITEM`.
     */
    export function findParentItemHtmlElement(child: HTMLElement): HTMLElement | undefined {
        return findParentHtmlElement(child, Breadcrumbs.Styles.BREADCRUMB_ITEM);
    }

    /**
     * Traverse upstream (starting with the HTML element `child`) to find a parent HTML element
     * that has the CSS class `Breadcrumbs.Styles.BREADCRUMBS`.
     */
    export function findParentBreadcrumbsHtmlElement(child: HTMLElement): HTMLElement | undefined {
        return findParentHtmlElement(child, Breadcrumbs.Styles.BREADCRUMBS);
    }

    /**
     * Traverse upstream (starting with the HTML element `child`) to find a parent HTML element
     * that has the given CSS class.
     */
    export function findParentHtmlElement(child: HTMLElement, cssClass: string): HTMLElement | undefined {
        if (child.classList.contains(cssClass)) {
            return child;
        } else {
            if (child.parentElement) {
                return findParentHtmlElement(child.parentElement, cssClass);
            }
        }
    }

    /**
     * Determines the popup anchor for the given mouse event.
     *
     * It finds the parent HTML element with CSS class `Breadcrumbs.Styles.BREADCRUMB_ITEM` of event's target element
     * and return the bottom left corner of this element.
     */
    export function determinePopupAnchor(event: MouseEvent): Coordinate | undefined {
        if (!(event.target instanceof HTMLElement)) {
            return undefined;
        }
        const itemHtmlElement = findParentItemHtmlElement(event.target);
        if (itemHtmlElement) {
            const { left, bottom } = itemHtmlElement.getBoundingClientRect();
            return {
                x: left,
                y: bottom,
            };
        }
    }
}

export const BreadcrumbsRendererFactory = Symbol('BreadcrumbsRendererFactory');
export interface BreadcrumbsRendererFactory {
    (): BreadcrumbsRenderer;
}
