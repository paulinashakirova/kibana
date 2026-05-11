/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/api';
import { apiTest, COMMON_HEADERS, KBN_ARCHIVES } from '../fixtures';

interface SavedObjectTaggingUsageStats {
  usedTags: number;
  taggedObjects: number;
  types: {
    dashboard: {
      taggedObjects: number;
      usedTags: number;
    };
    visualization: {
      taggedObjects: number;
      usedTags: number;
    };
  };
}

apiTest.describe(
  'POST /internal/telemetry/clusters/_stats for saved_object_tagging usage collection',
  { tag: '@local-stateful-classic' },
  () => {
    let viewerCookieHeader: Record<string, string>;

    apiTest.beforeAll(async ({ samlAuth }) => {
      viewerCookieHeader = (await samlAuth.asInteractiveUser('viewer')).cookieHeader;
    });

    apiTest.beforeEach(async ({ kbnClient }) => {
      await kbnClient.savedObjects.cleanStandardList();
      await kbnClient.importExport.load(KBN_ARCHIVES.USAGE_COLLECTION);
    });

    apiTest.afterEach(async ({ kbnClient }) => {
      await kbnClient.importExport.unload(KBN_ARCHIVES.USAGE_COLLECTION);
    });

    /*
     * Dataset description:
     *
     * 5 tags: tag-1 tag-2 tag-3 tag-4 unused-tag
     * 3 dashboard:
     *   - dash-1: ref to tag-1 + tag-2
     *   - dash-2: ref to tag-2 + tag 4
     *   - dash-3: no ref to any tag
     * 3 visualization:
     *   - vis-1: ref to tag-1
     *   - vis-2: ref to tag-1 + tag-3
     *   - vis-3: ref to tag-3
     */
    apiTest('collects the expected usage stats for a viewer', async ({ apiClient }) => {
      const response = await apiClient.post('internal/telemetry/clusters/_stats', {
        headers: {
          ...COMMON_HEADERS,
          'elastic-api-version': '2',
          ...viewerCookieHeader,
        },
        body: {
          unencrypted: true,
          refreshCache: true,
        },
      });

      expect(response).toHaveStatusCode(200);
      expect(response.body.length).toBeGreaterThan(0);

      const [payload] = response.body as Array<{
        stats: {
          stack_stats: {
            kibana: {
              plugins: {
                saved_objects_tagging: SavedObjectTaggingUsageStats;
              };
            };
          };
        };
      }>;

      const taggingStats = payload.stats.stack_stats.kibana.plugins.saved_objects_tagging;

      expect(taggingStats).toStrictEqual({
        usedTags: 4,
        taggedObjects: 5,
        types: {
          dashboard: {
            taggedObjects: 2,
            usedTags: 3,
          },
          visualization: {
            taggedObjects: 3,
            usedTags: 2,
          },
        },
      });
    });
  }
);
