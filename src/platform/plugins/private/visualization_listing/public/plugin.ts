/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Plugin, CoreSetup, CoreStart } from '@kbn/core/public';
import type { VisualizationsSetup, VisualizationsStart } from '@kbn/visualizations-plugin/public';
import type { DashboardSetup } from '@kbn/dashboard-plugin/public';
import type { EmbeddableStart } from '@kbn/embeddable-plugin/public';
import type { ContentManagementPublicStart } from '@kbn/content-management-plugin/public';
import type { SavedObjectsTaggingApi } from '@kbn/saved-objects-tagging-oss-plugin/public';
import { i18n } from '@kbn/i18n';
import type { TableListTabParentProps } from '@kbn/content-management-tabbed-table-list-view';

interface SetupDependencies {
  visualizations: VisualizationsSetup;
  dashboard?: DashboardSetup;
}

interface StartDependencies {
  visualizations: VisualizationsStart;
  embeddable: EmbeddableStart;
  contentManagement: ContentManagementPublicStart;
  savedObjectsTaggingOss?: {
    getTaggingApi: () => SavedObjectsTaggingApi;
  };
}

/** @public */
export type VisualizationListingPluginSetup = void;
export type VisualizationListingPluginStart = void;

/** @public */
export class VisualizationListingPlugin
  implements
    Plugin<
      VisualizationListingPluginSetup,
      VisualizationListingPluginStart,
      SetupDependencies,
      StartDependencies
    >
{
  public setup(core: CoreSetup<StartDependencies>, dependencies: SetupDependencies) {
    // Register visualizations tab with Dashboard's listing view
    if (dependencies.dashboard) {
      const visualizationsTabConfig = {
        title: i18n.translate('visualizationListing.dashboardListingTab.title', {
          defaultMessage: 'Visualizations',
        }),
        id: 'visualizations',
        getTableList: async (props: TableListTabParentProps) => {
          const [coreStart, pluginsStart] = await core.getStartServices();
          const { GetVisualizationsTableList } = await import(
            '@kbn/visualizations-plugin/public/visualization_listing'
          );

          return GetVisualizationsTableList(props, {
            core: coreStart,
            embeddable: pluginsStart.embeddable,
            savedObjectsTagging: pluginsStart.savedObjectsTaggingOss?.getTaggingApi(),
            contentManagement: pluginsStart.contentManagement,
            visualizeCapabilities: coreStart.application.capabilities.visualize_v2,
            showNewVisModal: pluginsStart.visualizations.showNewVisModal,
            navigateToVisualization: (stateTransfer: any, id: string) => {
              stateTransfer.navigateToEditor('visualize', {
                path: id,
                state: {
                  originatingApp: '',
                },
              });
            },
            visualizationsService: {
              findListItems: pluginsStart.visualizations.findListItems,
              getTypes: () => pluginsStart.visualizations,
            },
          });
        },
      };

      dependencies.dashboard.listingViewRegistry.add(visualizationsTabConfig);
    }
  }

  public start(core: CoreStart, plugins: object): void {}
}
