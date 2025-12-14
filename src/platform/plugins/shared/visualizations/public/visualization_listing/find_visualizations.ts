/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Reference } from '@kbn/content-management-utils';
import type { UserContentCommonSchema } from '@kbn/content-management-table-list-view-common';
import type { VisualizationListItem } from '../vis_types/vis_type_alias_registry';
import type { VisualizationsTabServices } from '.';

export type VisualizeUserContent = VisualizationListItem &
  UserContentCommonSchema & {
    type: string;
    attributes: {
      id: string;
      title: string;
      description?: string;
      readOnly: boolean;
      error?: string;
    };
  };

export async function findVisualizationsForDashboard(
  searchTerm: string,
  services: VisualizationsTabServices,
  options?: { references?: Reference[]; referencesToExclude?: Reference[] }
): Promise<{ total: number; hits: VisualizeUserContent[] }> {
  const { core, visualizationsService } = services;
  const limit = core.uiSettings.get<number>('savedObjects:listingLimit');

  const { total, hits } = await visualizationsService.findListItems(
    searchTerm,
    limit,
    options?.references,
    options?.referencesToExclude
  );

  const mappedHits = hits.map((item) => {
    const vis = item as VisualizationListItem & { readOnly?: boolean };
    return {
      ...vis,
      type: vis.type || vis.savedObjectType,
      attributes: {
        id: vis.id,
        title: vis.title,
        description: vis.description,
        readOnly: vis.readOnly ?? false,
        error: vis.error,
      },
    };
  }) as VisualizeUserContent[];

  return {
    total,
    hits: mappedHits,
  };
}
