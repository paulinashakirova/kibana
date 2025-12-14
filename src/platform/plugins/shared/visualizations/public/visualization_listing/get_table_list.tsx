/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useCallback, useMemo, useRef } from 'react';
import { css } from '@emotion/react';
import { logicalSizeCSS, useEuiTheme } from '@elastic/eui';
import type { EuiBasicTableColumn } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedRelative } from '@kbn/i18n-react';
import type { Reference } from '@kbn/content-management-utils';
import type { ContentManagementPublicStart } from '@kbn/content-management-plugin/public';
import type { OpenContentEditorParams } from '@kbn/content-management-content-editor';
import {
  TableListViewTable,
  TableListViewKibanaProvider,
} from '@kbn/content-management-table-list-view-table';
import type { TableListTabParentProps } from '@kbn/content-management-tabbed-table-list-view';
import type { CoreStart } from '@kbn/core-lifecycle-browser';
import type { EmbeddableStart, EmbeddableStateTransfer } from '@kbn/embeddable-plugin/public';
import type { SavedObjectsTaggingApi } from '@kbn/saved-objects-tagging-oss-plugin/public';
import { findVisualizationsForDashboard, type VisualizeUserContent } from './find_visualizations';
import { getVisualizationListingColumn } from './visualization_listing_helpers';
import { getVisualizationListingEmptyPrompt } from './visualization_listing_helpers';
import {
  deleteListItems,
  updateBasicSoAttributes,
} from '../utils/saved_objects_utils/update_basic_attributes';
import { checkForDuplicateTitle } from '../utils/saved_objects_utils/check_for_duplicate_title';
import type { TypesStart } from '../vis_types';

export interface VisualizationsTabServices {
  core: CoreStart;
  embeddable: EmbeddableStart;
  savedObjectsTagging?: SavedObjectsTaggingApi;
  contentManagement: ContentManagementPublicStart;
  visualizeCapabilities: Record<string, boolean | Record<string, boolean>>;
  showNewVisModal: () => () => void;
  navigateToVisualization: (stateTransfer: EmbeddableStateTransfer, id: string) => void;
  visualizationsService: {
    findListItems: (
      searchTerm: string,
      limit: number,
      references?: Reference[],
      referencesToExclude?: Reference[]
    ) => ReturnType<typeof import('../utils/saved_visualize_utils').findListItems>;
    getTypes: () => TypesStart;
  };
}

// Internal component that uses hooks
const VisualizationsTableListContent = ({
  parentProps,
  services,
}: {
  parentProps: TableListTabParentProps;
  services: VisualizationsTabServices;
}) => {
  const {
    core,
    embeddable,
    savedObjectsTagging,
    contentManagement,
    visualizeCapabilities,
    showNewVisModal,
    navigateToVisualization,
    visualizationsService,
  } = services;

  // Store current visualizations for reference in content editor
  const visualizedUserContent = useRef<VisualizeUserContent[]>();

  // Create visualization handler
  const createItem = (): void => {
    showNewVisModal();
  };

  // Content editor save handler - updates title, description, tags
  const onContentEditorSave = useCallback(
    async (args: { id: string; title: string; description?: string; tags: string[] }) => {
      const content = visualizedUserContent.current?.find(({ id }) => id === args.id);

      if (content) {
        await updateBasicSoAttributes(
          content.attributes.id,
          content.type,
          {
            title: args.title,
            description: args.description ?? '',
            tags: args.tags,
          },
          {
            savedObjectsTagging,
            overlays: core.overlays,
            typesService: visualizationsService.getTypes(),
            contentManagement,
            http: core.http,
          }
        );
      }
    },
    [core, savedObjectsTagging, contentManagement, visualizationsService]
  );

  // Content editor validators - check for duplicate titles
  const contentEditorValidators: OpenContentEditorParams['customValidators'] = useMemo(
    () => ({
      title: [
        {
          type: 'warning',
          async fn(value, id) {
            if (id) {
              const content = visualizedUserContent.current?.find((c) => c.id === id);
              if (content) {
                try {
                  await checkForDuplicateTitle(
                    {
                      id,
                      title: value,
                      lastSavedTitle: content.title,
                    },
                    false,
                    false,
                    () => {}
                  );
                } catch (e) {
                  return i18n.translate('visualizations.listing.duplicateTitleWarning', {
                    defaultMessage: 'Saving "{value}" creates a duplicate title.',
                    values: {
                      value,
                    },
                  });
                }
              }
            }
          },
        },
      ],
    }),
    []
  );

  // Edit item handler - used by actions column
  const editItem = async (item: VisualizeUserContent) => {
    const { id } = item.attributes;
    const { editor } = item;

    // Handle custom editor (e.g., onEdit callback)
    if (editor && 'onEdit' in editor) {
      await editor.onEdit(id);
      return;
    }

    // Use editor config if available (e.g., maps have editApp='maps')
    if (editor && 'editUrl' in editor && editor.editApp) {
      core.application.navigateToApp(editor.editApp, { path: editor.editUrl });
      return;
    }

    // Default: open in visualize app
    navigateToVisualization(embeddable.getStateTransfer(), id!);
  };

  // Get visualization capabilities
  const canSave = (visualizeCapabilities?.save as boolean) ?? false;
  const canDelete =
    (visualizeCapabilities?.delete as boolean) ?? (visualizeCapabilities?.save as boolean) ?? false;

  // Delete items handler
  const deleteItemsHandler = useCallback(
    async (items: object[]) => {
      await deleteListItems(items, {
        savedObjectsTagging,
        overlays: core.overlays,
        typesService: visualizationsService.getTypes(),
        contentManagement,
        http: core.http,
      }).catch((error) => {
        core.notifications.toasts.addError(error, {
          title: i18n.translate('visualizations.listing.deleteErrorTitle', {
            defaultMessage: 'Error deleting visualization',
          }),
        });
      });
    },
    [core, savedObjectsTagging, contentManagement, visualizationsService]
  );

  // Conditionally provide deleteItems based on capabilities
  const deleteItems = canDelete ? deleteItemsHandler : undefined;

  // Click handler for visualization items (title click)
  const getOnClickTitle = (item: VisualizeUserContent) => {
    // Don't allow clicking on read-only visualizations
    if (item.attributes.readOnly || item.error) {
      return undefined;
    }

    return () => editItem(item);
  };

  // Row item actions - control action button states
  const rowItemActions = useCallback(
    (item: VisualizeUserContent) => {
      const { managed } = item;
      const isReadOnlyVisualization = item.attributes.readOnly;

      // Disable actions for items without save permissions, managed items, or read-only visualizations
      if (!canSave || managed || isReadOnlyVisualization) {
        return {
          edit: {
            enabled: false,
            reason: managed
              ? i18n.translate('visualizations.listing.managedVisualizationMessage', {
                  defaultMessage:
                    'Elastic manages this visualization. Changing it is not possible.',
                })
              : isReadOnlyVisualization
              ? i18n.translate('visualizations.listing.readOnlyVisualizationMessage', {
                  defaultMessage:
                    "These details can't be edited because this visualization is no longer supported.",
                })
              : undefined,
          },
        };
      }

      return undefined;
    },
    [canSave]
  );

  // Find items handler - used for searching/filtering
  const findItems = async (
    searchTerm: string,
    options?: { references?: Reference[]; referencesToExclude?: Reference[] }
  ) => {
    const result = await findVisualizationsForDashboard(searchTerm, services, options);
    // Store for content editor reference
    visualizedUserContent.current = result.hits;
    return result;
  };

  const { euiTheme } = useEuiTheme();

  return (
    <TableListViewKibanaProvider
      {...{
        core,
        savedObjectsTagging,
        FormattedRelative,
      }}
    >
      <div
        css={css`
          .visListingTable__typeImage,
          .visListingTable__typeIcon {
            margin-right: ${euiTheme.size.s};
            position: relative;
            top: -1px;
          }

          .visListingTable__typeImage {
            ${logicalSizeCSS(euiTheme.size.base, euiTheme.size.base)};
          }
        `}
      >
        <TableListViewTable<VisualizeUserContent>
          tableCaption={i18n.translate('visualizations.listing.table.listTitle', {
            defaultMessage: 'Visualizations',
          })}
          entityName={i18n.translate('visualizations.listing.table.entityName', {
            defaultMessage: 'visualization',
          })}
          entityNamePlural={i18n.translate('visualizations.listing.table.entityNamePlural', {
            defaultMessage: 'visualizations',
          })}
          id="visualizations"
          initialPageSize={10}
          findItems={findItems}
          createItem={createItem}
          editItem={editItem}
          deleteItems={deleteItems}
          contentEditor={{
            isReadonly: !canSave,
            onSave: onContentEditorSave,
            customValidators: contentEditorValidators,
          }}
          emptyPrompt={getVisualizationListingEmptyPrompt(createItem)}
          getOnClickTitle={getOnClickTitle}
          rowItemActions={rowItemActions}
          customTableColumn={
            getVisualizationListingColumn() as EuiBasicTableColumn<VisualizeUserContent>
          }
          {...parentProps}
        />
      </div>
    </TableListViewKibanaProvider>
  );
};

// Main export: regular function (not a component) that returns JSX
// This is called from async context, so it cannot use hooks directly
export const GetVisualizationsTableList = (
  parentProps: TableListTabParentProps,
  services: VisualizationsTabServices
) => {
  return <VisualizationsTableListContent parentProps={parentProps} services={services} />;
};
