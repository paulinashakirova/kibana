/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Locator } from '@playwright/test';
import type { ScoutPage } from '..';
import { expect } from '../../../ui';

/**
 * Page object that wraps common interactions with the Kibana Monaco-based code editor.
 *
 * Initially the API is intentionally aligned with the FTR `MonacoEditorService`
 * (`src/platform/test/functional/services/monaco_editor.ts`).
 */
export class KibanaCodeEditorWrapper {
  constructor(private readonly page: ScoutPage) {}

  private async getEditorModelUriByTestSubj(testSubjId: string): Promise<string> {
    // `data-uri` is an internal Monaco DOM attribute — not part of the public API.
    // No public alternative exists in Monaco 0.54; re-check on future Monaco upgrades.
    const modelUri = await this.page.evaluate((id) => {
      const container = document.querySelector(`[data-test-subj="${id}"]`);
      return container?.querySelector('.monaco-editor[data-uri]')?.getAttribute('data-uri') ?? null;
    }, testSubjId);

    if (!modelUri) {
      throw new Error(`Editor model URI not found for data-test-subj="${testSubjId}"`);
    }

    return modelUri;
  }

  /**
   * Waits until the editor inside the given container is ready to accept interactions.
   * Safe to call before reading or writing editor content.
   */
  async waitCodeEditorReady(dataTestSubjId: string): Promise<void> {
    await expect
      .poll(
        async () =>
          this.page.evaluate((id) => {
            const monacoEnv = (window as Window & { MonacoEnvironment?: any }).MonacoEnvironment;
            const container = document.querySelector(`[data-test-subj="${id}"]`);
            const editor = monacoEnv?.monaco?.editor
              ?.getEditors?.()
              ?.find((instance: any) => container?.contains(instance.getDomNode()));
            return Boolean(editor);
          }, dataTestSubjId),
        { timeout: 10_000 }
      )
      .toBe(true);
  }

  /**
   * Returns the current value of the Monaco editor model at the given index.
   *
   * This uses the globally registered `window.MonacoEnvironment.monaco.editor`
   * (see `src/platform/packages/shared/kbn-monaco/src/register_globals.ts`).
   *
   * @param nthIndex - Index of the Monaco text model to read. Defaults to `0`.
   * @returns The current editor value as a string. If no models are registered,
   *   an empty string is returned.
   */
  async getCodeEditorValue(nthIndex: number = 0): Promise<string> {
    let result = '';

    await expect(async () => {
      result = await this.page.evaluate((index) => {
        const monacoEnv = (window as any).MonacoEnvironment;

        if (!monacoEnv?.monaco?.editor) {
          throw new Error('MonacoEnvironment.monaco.editor is not available');
        }

        const values: string[] = monacoEnv.monaco.editor
          .getModels()
          .map((model: any) => model.getValue() as string);

        if (!values.length) {
          return '';
        }

        if (index >= 0 && index < values.length) {
          return values[index]!;
        }

        // Fallback to the first model value if the requested index is out of range
        return values[0]!;
      }, nthIndex);
    }).toPass({ timeout: 30_000 });

    return result;
  }

  /**
   * Sets the value of the Monaco editor model at the given index using the
   * global `MonacoEnvironment`, and verifies that the value was applied.
   *
   * @param value - New value to set in the editor.
   * @param nthIndex - Optional index of the Monaco text model to update.
   *   When omitted, all models are updated (matching the FTR behavior).
   */
  async setCodeEditorValue(value: string, nthIndex?: number): Promise<string> {
    await this.page.evaluate(
      ({ editorIndex, codeEditorValue }) => {
        const monacoEnv = (window as any).MonacoEnvironment;

        if (!monacoEnv?.monaco?.editor) {
          throw new Error('MonacoEnvironment.monaco.editor is not available');
        }

        const editor = monacoEnv.monaco.editor;
        const textModels: any[] = editor.getModels();

        if (!textModels.length) {
          throw new Error('No Monaco editor models found');
        }

        if (typeof editorIndex === 'number' && textModels[editorIndex]) {
          textModels[editorIndex].setValue(codeEditorValue);
        } else {
          // When the specific model instance is unknown, update all models
          textModels.forEach((model) => model.setValue(codeEditorValue));
        }
      },
      { editorIndex: nthIndex, codeEditorValue: value }
    );

    // Return the new value for later assertions
    return await this.getCodeEditorValue(nthIndex ?? 0);
  }

  /**
   * Replaces the entire content of the editor inside the given container with `value`.
   * Waits for the editor to be ready before writing.
   */
  async setCodeEditorValueByTestSubj(testSubjId: string, value: string): Promise<void> {
    await this.waitCodeEditorReady(testSubjId);
    const modelUri = await this.getEditorModelUriByTestSubj(testSubjId);

    await this.page.evaluate(
      ({ uri, text }) => {
        const monacoEditorApi = (window as Window & { MonacoEnvironment?: any }).MonacoEnvironment
          ?.monaco?.editor;
        if (!monacoEditorApi) {
          throw new Error('MonacoEnvironment.monaco.editor is not available');
        }

        const monacoUri = (
          window as Window & { MonacoEnvironment?: any }
        ).MonacoEnvironment?.monaco?.Uri.parse(uri);
        if (!monacoUri) {
          throw new Error('Monaco Uri is not available');
        }
        const model = monacoEditorApi.getModel(monacoUri);
        if (!model) {
          throw new Error(`Editor model not found for URI "${uri}"`);
        }
        model.setValue(text);

        const editor = monacoEditorApi
          .getEditors?.()
          ?.find((instance: any) => instance.getModel()?.uri?.toString() === uri);
        editor?.focus();
      },
      { uri: modelUri, text: value }
    );
  }

  /**
   * Returns a locator for the current Monaco error markers inside the given
   * editor container.
   *
   * This mirrors the FTR helper that finds `.cdr.squiggly-error` elements,
   * but exposes a Playwright `Locator` so callers can assert on count, text, etc.
   *
   * @param testSubjId - `data-test-subj` of the editor container.
   *   Defaults to `'kibanaCodeEditor'`.
   * @returns A Playwright `Locator` for the current error markers.
   */
  getCurrentMarkers(testSubjId: string = 'kibanaCodeEditor'): Locator {
    const selector = `[data-test-subj="${testSubjId}"] .cdr.squiggly-error`;
    return this.page.locator(selector);
  }

  public getCodeEditorSuggestWidget() {
    return this.page.locator(
      '[data-test-subj="kbnCodeEditorEditorOverflowWidgetsContainer"] .suggest-widget'
    );
  }
}
