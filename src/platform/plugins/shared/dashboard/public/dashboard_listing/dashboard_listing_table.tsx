/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useMemo, useCallback } from 'react';

import {
  TableListViewKibanaProvider,
  TableListViewTable,
} from '@kbn/content-management-table-list-view-table';
import { FormattedRelative, I18nProvider } from '@kbn/i18n-react';
import { useExecutionContext } from '@kbn/kibana-react-plugin/public';

import {
  coreServices,
  savedObjectsTaggingService,
  serverlessService,
} from '../services/kibana_services';
import { getDashboardBackupService } from '../services/dashboard_backup_service';
import { confirmCreateWithUnsaved } from './confirm_overlays';
import { DashboardUnsavedListing } from './dashboard_unsaved_listing';
import { DashboardListingEmptyPrompt } from './dashboard_listing_empty_prompt';
import { useDashboardListingTable } from './hooks/use_dashboard_listing_table';
import { getDashboardCapabilities } from '../utils/get_dashboard_capabilities';
import type { DashboardListingProps, DashboardSavedObjectUserContent } from './types';

export const DashboardListingTable = ({
  disableCreateDashboardButton,
  initialFilter,
  goToDashboard,
  getDashboardUrl,
  useSessionStorageIntegration,
  urlStateEnabled,
  showCreateDashboardButton = true,
}: DashboardListingProps) => {
  useExecutionContext(coreServices.executionContext, {
    type: 'application',
    page: 'list',
  });

  const {
    unsavedDashboardIds,
    refreshUnsavedDashboards,
    tableListViewTableProps: { title: tableCaption, ...tableListViewTable },
    contentInsightsClient,
  } = useDashboardListingTable({
    goToDashboard,
    getDashboardUrl,
    urlStateEnabled,
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
    <I18nProvider>
      <TableListViewKibanaProvider
        core={coreServices}
        savedObjectsTagging={savedObjectsTaggingService?.getTaggingApi()}
        FormattedRelative={FormattedRelative}
        contentInsightsClient={contentInsightsClient}
        isKibanaVersioningEnabled={!serverlessService}
      >
        <>
          <DashboardUnsavedListing
            goToDashboard={goToDashboard}
            unsavedDashboardIds={unsavedDashboardIds}
            refreshUnsavedDashboards={refreshUnsavedDashboards}
          />
          <TableListViewTable<DashboardSavedObjectUserContent>
            tableCaption={tableCaption}
            {...tableListViewTable}
            createItem={
              !showWriteControls || !showCreateDashboardButton || disableCreateDashboardButton
                ? undefined
                : createItem
            }
            emptyPrompt={emptyPrompt}
            onFetchSuccess={() => {}}
            setPageDataTestSubject={() => {}}
          />
        </>
      </TableListViewKibanaProvider>
    </I18nProvider>
  );
};
