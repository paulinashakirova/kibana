/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { XJSON_LANG_ID, PAINLESS_LANG_ID, CONSOLE_LANG_ID, YAML_LANG_ID } from './languages';
import { monaco } from './monaco_imports';

export const DEFAULT_WORKER_ID = 'default' as const;

const langSpecificWorkerIds = [
  monaco.languages.json.jsonDefaults.languageId,
  XJSON_LANG_ID,
  PAINLESS_LANG_ID,
  YAML_LANG_ID,
  CONSOLE_LANG_ID,
] as const;

// exported for use in webpack config to build workers
export type LangSpecificWorkerIds = [typeof DEFAULT_WORKER_ID, ...typeof langSpecificWorkerIds];

declare module 'monaco-editor/esm/vs/editor/editor.api' {
  export interface Environment {
    // add typing for exposing monaco on the MonacoEnvironment property
    monaco: typeof monaco;
  }
}

const monacoBundleDir = (window as any).__kbnPublicPath__?.['kbn-monaco'];

window.MonacoEnvironment = {
  // passed for use in functional and unit tests so that we can verify values from 'editor'
  monaco,
  getWorkerUrl: monacoBundleDir
    ? (_: string, languageId: string) => {
        const workerId = langSpecificWorkerIds.includes(languageId)
          ? languageId
          : DEFAULT_WORKER_ID;
        return `${monacoBundleDir}${workerId}.editor.worker.js`;
      }
    : () => '',
};

// Monaco 0.54 changed createWebWorker to accept `{ worker: Worker|Promise<Worker> }` instead of
// the previous `{ moduleId, label, createData }`. monaco-yaml (via monaco-worker-manager@2) still
// uses the old signature. This shim intercepts old-style calls, manually creates the Worker, sends
// the two initialization messages monaco-worker-manager requires before Monaco's own INITIALIZE
// handshake, then forwards to the real createWebWorker with the new API.
//
// TODO: remove this shim once monaco-yaml (currently 5.4.0) / monaco-worker-manager (currently
// 2.0.1, unmaintained as of 2022) is updated to pass a `worker` factory directly and no longer
// calls createWebWorker with the old `{ moduleId }` shape. No upstream tracking issue exists yet;
// check both repos when upgrading monaco-yaml.
{
  // Monaco's editor.api.d.ts merges two `editor` namespaces so `createWebWorker` is typed only as
  // the legacy `{ moduleId }` overload; the runtime accepts `IInternalWebWorkerOptions` as well.
  const originalCreateWebWorker = monaco.editor.createWebWorker as <T extends object>(
    opts: monaco.editor.IInternalWebWorkerOptions | monaco.editor.IWebWorkerOptions
  ) => monaco.editor.MonacoWebWorker<T>;
  monaco.editor.createWebWorker = function (opts: any) {
    if (opts?.moduleId && !opts?.worker) {
      const label: string = opts.label ?? 'default';
      const url: string =
        typeof window.MonacoEnvironment?.getWorkerUrl === 'function'
          ? window.MonacoEnvironment.getWorkerUrl('workerMain.js', label) ?? ''
          : '';
      if (url) {
        const worker = new Worker(url, { name: label });
        worker.postMessage({}); // trigger: installs monaco-worker-manager's onmessage handler
        worker.postMessage(opts.createData ?? {}); // createData payload for the language service factory
        return originalCreateWebWorker.call(this, {
          worker,
          host: opts.host,
          keepIdleModels: opts.keepIdleModels,
        });
      }
    }
    return originalCreateWebWorker.call(this, opts);
  };
}
