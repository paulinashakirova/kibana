/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// eslint-disable-next-line import/no-extraneous-dependencies
import '@testing-library/jest-dom';

// Monaco 0.54.0 Delayer.cancel() rejects its completionPromise with CancellationError when
// WordHighlighter disposes during model disposal. WordHighlighter doesn't attach .catch() to
// the Delayer promise, so the rejection surfaces as unhandled and fails tests.
//
// Jest-circus registers its 'unhandledRejection' listener AFTER setupFilesAfterFramework runs,
// so any listener-based filtering is bypassed. The correct fix is to patch Delayer.prototype.cancel
// to leave the promise pending (do not reject) instead of rejecting with CancellationError.
// This eliminates the unhandled rejection at the source without affecting Monaco's public API.
beforeAll(() => {
  const monacoAsync = jest.requireActual('monaco-editor/esm/vs/base/common/async') as {
    Delayer?: { prototype?: any };
  };
  if (monacoAsync?.Delayer?.prototype) {
    monacoAsync.Delayer.prototype.cancel = function () {
      this.cancelTimeout();
      if (this.completionPromise) {
        // Leave the promise pending rather than rejecting — the promise object is
        // no longer reachable (refs nulled), so it will be GC'd. No rejection = no
        // unhandled CancellationError from WordHighlighter cleanup during test teardown.
        this.completionPromise = null;
        this.doReject = null;
        this.doResolve = null;
      }
    };
  }
});

// Mock navigator.clipboard for Monaco Editor 0.45.0+
// Monaco's Safari workaround cancels internal DeferredPromises, causing unhandled rejections in tests
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: jest.fn().mockResolvedValue(undefined),
    readText: jest.fn().mockResolvedValue(''),
    write: jest.fn((items?: ClipboardItem[]) => {
      // Handle cancelled promises to prevent unhandled rejections
      items?.forEach((item: any) => {
        if (item?.data) {
          Object.values(item.data).forEach((value: any) => {
            if (value?.catch) {
              value.catch((error: any) => {
                // Only suppress expected cancellations; let real errors fail tests
                if (error?.message !== 'Canceled' && error?.name !== 'Canceled') {
                  throw error;
                }
              });
            }
          });
        }
      });
      return Promise.resolve();
    }),
    read: jest.fn().mockResolvedValue([]),
  },
  configurable: true,
});
