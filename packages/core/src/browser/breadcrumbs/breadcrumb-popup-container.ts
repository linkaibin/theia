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

import { inject, injectable, postConstruct } from '../../../shared/inversify';
import { Emitter, Event } from '../../common';
import { Disposable, DisposableCollection } from '../../common/disposable';
import { Coordinate } from '../context-menu-renderer';
import { RendererHost } from '../widgets/react-renderer';
import { Breadcrumbs } from './breadcrumbs';

export interface BreadcrumbPopupContainerFactory {
    (parent: HTMLElement, breadcrumbId: string, position: Coordinate): BreadcrumbPopupContainer;
}
export const BreadcrumbPopupContainerFactory = Symbol('BreadcrumbPopupContainerFactory');

export type BreadcrumbID = string;
export const BreadcrumbID = Symbol('BreadcrumbID');

/**
 * This class creates a popup container at the given position
 * so that contributions can attach their HTML elements
 * as children of `BreadcrumbPopupContainer#container`.
 *
 * - `dispose()` is called on blur or on hit on escape
 */
@injectable()
export class BreadcrumbPopupContainer implements Disposable {
    @inject(RendererHost) protected readonly parent: RendererHost;
    @inject(BreadcrumbID) public readonly breadcrumbId: BreadcrumbID;
    @inject(Coordinate) protected readonly position: Coordinate;

    protected onDidDisposeEmitter = new Emitter<void>();
    protected toDispose: DisposableCollection = new DisposableCollection(this.onDidDisposeEmitter);
    get onDidDispose(): Event<void> {
        return this.onDidDisposeEmitter.event;
    }

    protected _container: HTMLElement;
    get container(): HTMLElement {
        return this._container;
    }

    protected _isOpen: boolean;
    get isOpen(): boolean {
        return this._isOpen;
    }

    @postConstruct()
    protected init(): void {
        this._container = this.createPopupDiv(this.position);
        document.addEventListener('keyup', this.escFunction);
        this._container.focus();
        this._isOpen = true;
    }

    protected createPopupDiv(position: Coordinate): HTMLDivElement {
        const result = window.document.createElement('div');
        result.className = Breadcrumbs.Styles.BREADCRUMB_POPUP;
        result.style.left = `${position.x}px`;
        result.style.top = `${position.y}px`;
        result.tabIndex = 0;
        result.onblur = event => this.onBlur(event, this.breadcrumbId);
        this.parent.appendChild(result);
        return result;
    }

    protected onBlur = (event: FocusEvent, breadcrumbId: string) => {
        if (event.relatedTarget && event.relatedTarget instanceof HTMLElement) {
            // event.relatedTarget is the element that has the focus after this popup looses the focus.
            // If a breadcrumb was clicked the following holds the breadcrumb ID of the clicked breadcrumb.
            const clickedBreadcrumbId = event.relatedTarget.getAttribute('data-breadcrumb-id');
            if (clickedBreadcrumbId && clickedBreadcrumbId === breadcrumbId) {
                // This is a click on the breadcrumb that has openend this popup.
                // We do not close this popup here but let the click event of the breadcrumb handle this instead
                // because it needs to know that this popup is open to decide if it just closes this popup or
                // also opens a new popup.
                return;
            }
            if (this._container.contains(event.relatedTarget)) {
                // A child element gets focus. Set the focus to the container again.
                // Otherwise the popup would not be closed when elements outside the popup get the focus.
                // A popup content should not rely on getting a focus.
                this._container.focus();
                return;
            }
        }
        this.dispose();
    };

    protected escFunction = (event: KeyboardEvent) => {
        if (event.key === 'Escape' || event.key === 'Esc') {
            this.dispose();
        }
    };

    dispose(): void {
        if (!this.toDispose.disposed) {
            this.onDidDisposeEmitter.fire();
            this.toDispose.dispose();
            this._container.remove();
            this._isOpen = false;
            document.removeEventListener('keyup', this.escFunction);
        }
    }
}
