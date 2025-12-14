/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useCallback, useMemo, useState } from 'react';
import type { OpenContentEditorParams } from '@kbn/content-management-content-editor';
import { ContentInsightsClient } from '@kbn/content-management-content-insights-public';
import type { TableListViewTableProps } from '@kbn/content-management-table-list-view-table';
import type { Reference } from '@kbn/content-management-utils';
import type { ViewMode } from '@kbn/presentation-publishing';
import { asyncMap } from '@kbn/std';
import { reportPerformanceMetricEvent } from '@kbn/ebt-tools';

import { DASHBOARD_SAVED_OBJECT_TYPE } from '../../../common/constants';
import { getDashboardBackupService } from '../../services/dashboard_backup_service';
import { getDashboardRecentlyAccessedService } from '../../services/dashboard_recently_accessed_service';
import { coreServices } from '../../services/kibana_services';
import { logger } from '../../services/logger';
import { getDashboardCapabilities } from '../../utils/get_dashboard_capabilities';
import { SAVED_OBJECT_DELETE_TIME } from '../../utils/telemetry_constants';
import {
  dashboardListingErrorStrings,
  dashboardListingTableStrings,
} from '../_dashboard_listing_strings';
import { type DashboardSavedObjectUserContent } from '../types';
import {
  checkForDuplicateDashboardTitle,
  dashboardClient,
  findService,
} from '../../dashboard_client';
import { findDashboardListingItems } from './helpers/find_items';

type GetDetailViewLink =
  TableListViewTableProps<DashboardSavedObjectUserContent>['getDetailViewLink'];

const SAVED_OBJECTS_LIMIT_SETTING = 'savedObjects:listingLimit';
const SAVED_OBJECTS_PER_PAGE_SETTING = 'savedObjects:perPage';

type DashboardListingViewTableProps = Omit<
  TableListViewTableProps<DashboardSavedObjectUserContent>,
  'tableCaption' | 'onFetchSuccess' | 'setPageDataTestSubject'
> & { title: string };

interface UseDashboardListingTableReturnType {
  refreshUnsavedDashboards: () => void;
  tableListViewTableProps: DashboardListingViewTableProps;
  unsavedDashboardIds: string[];
  contentInsightsClient: ContentInsightsClient;
}

export const useDashboardListingTable = ({
  dashboardListingId = 'dashboard',
  getDashboardUrl,
  goToDashboard,
  headingId = 'dashboardListingHeading',
  initialFilter,
  urlStateEnabled,
}: {
  dashboardListingId?: string;
  getDashboardUrl: (dashboardId: string, usesTimeRestore: boolean) => string;
  goToDashboard: (dashboardId?: string, viewMode?: ViewMode) => void;
  headingId?: string;
  initialFilter?: string;
  urlStateEnabled?: boolean;
}): UseDashboardListingTableReturnType => {
  const { getTableListTitle, getEntityName, getEntityNamePlural } = dashboardListingTableStrings;

  const entityName = getEntityName();
  const entityNamePlural = getEntityNamePlural();
  const title = getTableListTitle();

  const dashboardBackupService = useMemo(() => getDashboardBackupService(), []);

  const [unsavedDashboardIds, setUnsavedDashboardIds] = useState<string[]>(
    dashboardBackupService.getDashboardIdsWithUnsavedChanges()
  );

  const listingLimit = coreServices.uiSettings.get(SAVED_OBJECTS_LIMIT_SETTING);
  const initialPageSize = coreServices.uiSettings.get(SAVED_OBJECTS_PER_PAGE_SETTING);

  const updateItemMeta = useCallback(
    async ({ id, ...updatedState }: Parameters<Required<OpenContentEditorParams>['onSave']>[0]) => {
      const dashboard = await findService.findById(id);
      if (dashboard.status === 'error') {
        return;
      }
      const { references, ...currentState } = dashboard.attributes;
      await dashboardClient.update(
        id,
        {
          ...currentState,
          ...updatedState,
        },
        dashboard.references
      );

      setUnsavedDashboardIds(dashboardBackupService.getDashboardIdsWithUnsavedChanges());
    },
    [dashboardBackupService]
  );

  const contentEditorValidators: OpenContentEditorParams['customValidators'] = useMemo(
    () => ({
      title: [
        {
          type: 'warning',
          fn: async (value: string, id: string) => {
            if (id) {
              try {
                const dashboard = await findService.findById(id);
                if (dashboard.status === 'error') {
                  return;
                }

                const validTitle = await checkForDuplicateDashboardTitle({
                  title: value,
                  copyOnSave: false,
                  lastSavedTitle: dashboard.attributes.title,
                  isTitleDuplicateConfirmed: false,
                });

                if (!validTitle) {
                  throw new Error(dashboardListingErrorStrings.getDuplicateTitleWarning(value));
                }
              } catch (e) {
                return e.message;
              }
            }
          },
        },
      ],
    }),
    []
  );

  const deleteItems = useCallback(
    async (dashboardsToDelete: Array<{ id: string }>) => {
      try {
        const deleteStartTime = window.performance.now();

        await asyncMap(dashboardsToDelete, async ({ id }) => {
          await dashboardClient.delete(id);
          dashboardBackupService.clearState(id);
        });

        const deleteDuration = window.performance.now() - deleteStartTime;
        reportPerformanceMetricEvent(coreServices.analytics, {
          eventName: SAVED_OBJECT_DELETE_TIME,
          duration: deleteDuration,
          meta: {
            saved_object_type: DASHBOARD_SAVED_OBJECT_TYPE,
            total: dashboardsToDelete.length,
          },
        });
      } catch (error) {
        coreServices.notifications.toasts.addError(error, {
          title: dashboardListingErrorStrings.getErrorDeletingDashboardToast(),
        });
      }

      setUnsavedDashboardIds(dashboardBackupService.getDashboardIdsWithUnsavedChanges());
    },
    [dashboardBackupService]
  );

  const editItem = useCallback(
    ({ id }: { id: string | undefined }) => goToDashboard(id, 'edit'),
    [goToDashboard]
  );

  const getDetailViewLink = useCallback<NonNullable<GetDetailViewLink>>(
    ({ id, attributes: { timeRestore } }) => getDashboardUrl(id, timeRestore),
    [getDashboardUrl]
  );

  const rowItemActions = useCallback((item: DashboardSavedObjectUserContent) => {
    const { showWriteControls } = getDashboardCapabilities();
    const { managed } = item;

    if (!showWriteControls || managed) {
      return {
        edit: {
          enabled: false,
          reason: managed
            ? dashboardListingTableStrings.getManagementItemDisabledEditMessage()
            : undefined,
        },
      };
    }

    return undefined;
  }, []);

  const findItems = useCallback(
    (
      searchTerm: string,
      options?: { references?: Reference[]; referencesToExclude?: Reference[] }
    ) => findDashboardListingItems(searchTerm, options),
    []
  );

  const tableListViewTableProps: DashboardListingViewTableProps = useMemo(() => {
    const { showWriteControls } = getDashboardCapabilities();
    return {
      contentEditor: {
        isReadonly: !showWriteControls,
        onSave: updateItemMeta,
        customValidators: contentEditorValidators,
      },
      deleteItems: !showWriteControls ? undefined : deleteItems,
      editItem: !showWriteControls ? undefined : editItem,
      entityName,
      entityNamePlural,
      findItems,
      getDetailViewLink,
      rowItemActions,
      headingId,
      id: dashboardListingId,
      initialFilter,
      initialPageSize,
      listingLimit,
      title,
      urlStateEnabled,
      createdByEnabled: true,
      recentlyAccessed: getDashboardRecentlyAccessedService(),
    };
  }, [
    contentEditorValidators,
    dashboardListingId,
    deleteItems,
    editItem,
    entityName,
    entityNamePlural,
    findItems,
    getDetailViewLink,
    headingId,
    initialFilter,
    initialPageSize,
    listingLimit,
    rowItemActions,
    title,
    updateItemMeta,
    urlStateEnabled,
  ]);

  const refreshUnsavedDashboards = useCallback(
    () => setUnsavedDashboardIds(getDashboardBackupService().getDashboardIdsWithUnsavedChanges()),
    []
  );

  const contentInsightsClient = useMemo(
    () => new ContentInsightsClient({ http: coreServices.http, logger }, { domainId: 'dashboard' }),
    []
  );

  return {
    refreshUnsavedDashboards,
    tableListViewTableProps,
    unsavedDashboardIds,
    contentInsightsClient,
  };
};
