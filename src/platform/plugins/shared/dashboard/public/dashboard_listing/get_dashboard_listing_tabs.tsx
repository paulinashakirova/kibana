/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useCallback, useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import type {
  TableListTab,
  TableListTabParentProps,
} from '@kbn/content-management-tabbed-table-list-view';
import {
  TableListViewTable,
  TableListViewKibanaProvider,
} from '@kbn/content-management-table-list-view-table';
import { FormattedRelative } from '@kbn/i18n-react';
import { FavoritesClient } from '@kbn/content-management-favorites-public';
import { DASHBOARD_APP_ID } from '../../common/page_bundle_constants';
import { DASHBOARD_SAVED_OBJECT_TYPE } from '../../common/constants';
import {
  coreServices,
  savedObjectsTaggingService,
  serverlessService,
  usageCollectionService,
} from '../services/kibana_services';
import { getDashboardBackupService } from '../services/dashboard_backup_service';
import { confirmCreateWithUnsaved } from './confirm_overlays';
import { DashboardUnsavedListing } from './dashboard_unsaved_listing';
import { DashboardListingEmptyPrompt } from './dashboard_listing_empty_prompt';
import { useDashboardListingTable } from './hooks/use_dashboard_listing_table';
import {
  type DashboardListingProps,
  type DashboardListingUserContent,
  type DashboardSavedObjectUserContent,
} from './types';
import { getDashboardCapabilities } from '../utils/get_dashboard_capabilities';

type GetDashboardListingTabsParams = Pick<
  DashboardListingProps,
  | 'goToDashboard'
  | 'getDashboardUrl'
  | 'useSessionStorageIntegration'
  | 'initialFilter'
  | 'listingViewRegistry'
>;

type TabContentProps = Omit<GetDashboardListingTabsParams, 'listingViewRegistry'> & {
  parentProps: TableListTabParentProps<DashboardListingUserContent>;
};

const getBaseKibanaProviderProps = () => ({
  core: coreServices,
  savedObjectsTagging: savedObjectsTaggingService?.getTaggingApi(),
  FormattedRelative,
  isKibanaVersioningEnabled: !serverlessService,
});

const DashboardsTabContent = ({
  goToDashboard,
  getDashboardUrl,
  useSessionStorageIntegration,
  initialFilter,
  parentProps,
}: TabContentProps) => {
  const {
    unsavedDashboardIds,
    refreshUnsavedDashboards,
    tableListViewTableProps,
    contentInsightsClient,
  } = useDashboardListingTable({
    goToDashboard,
    getDashboardUrl,
    initialFilter,
  });

  const dashboardBackupService = useMemo(() => getDashboardBackupService(), []);

  const createItem = useCallback(() => {
    if (useSessionStorageIntegration && dashboardBackupService.dashboardHasUnsavedEdits()) {
      confirmCreateWithUnsaved(() => {
        dashboardBackupService.clearState();
        goToDashboard();
      }, goToDashboard);
      return;
    }
    goToDashboard();
  }, [dashboardBackupService, goToDashboard, useSessionStorageIntegration]);

  const dashboardFavoritesClient = useMemo(() => {
    return new FavoritesClient(DASHBOARD_APP_ID, DASHBOARD_SAVED_OBJECT_TYPE, {
      http: coreServices.http,
      usageCollection: usageCollectionService,
      userProfile: coreServices.userProfile,
    });
  }, []);

  const { showWriteControls } = getDashboardCapabilities();

  const emptyPrompt = (
    <DashboardListingEmptyPrompt
      createItem={createItem}
      goToDashboard={goToDashboard}
      refreshUnsavedDashboards={refreshUnsavedDashboards}
      unsavedDashboardIds={unsavedDashboardIds}
      useSessionStorageIntegration={useSessionStorageIntegration}
    />
  );

  return (
    <TableListViewKibanaProvider
      {...getBaseKibanaProviderProps()}
      favorites={dashboardFavoritesClient}
      contentInsightsClient={contentInsightsClient}
    >
      <DashboardUnsavedListing
        goToDashboard={goToDashboard}
        unsavedDashboardIds={unsavedDashboardIds}
        refreshUnsavedDashboards={refreshUnsavedDashboards}
      />
      <TableListViewTable<DashboardSavedObjectUserContent>
        tableCaption={tableListViewTableProps.title}
        {...tableListViewTableProps}
        createItem={showWriteControls ? createItem : undefined}
        emptyPrompt={emptyPrompt}
        {...parentProps}
      />
    </TableListViewKibanaProvider>
  );
};

export const getDashboardListingTabs = ({
  goToDashboard,
  getDashboardUrl,
  useSessionStorageIntegration,
  initialFilter,
  listingViewRegistry,
}: GetDashboardListingTabsParams): TableListTab<DashboardListingUserContent>[] => {
  const commonProps = {
    goToDashboard,
    getDashboardUrl,
    useSessionStorageIntegration,
    initialFilter,
  };

  const dashboardsTab: TableListTab<DashboardListingUserContent> = {
    title: i18n.translate('dashboard.listing.tabs.dashboards.title', {
      defaultMessage: 'Dashboards',
    }),
    id: DASHBOARD_APP_ID,
    getTableList: (parentProps) => (
      <DashboardsTabContent {...commonProps} parentProps={parentProps} />
    ),
  };

  const registryTabs = listingViewRegistry
    ? Array.from(listingViewRegistry as Set<TableListTab>)
    : [];

  return [dashboardsTab, ...registryTabs];
};
