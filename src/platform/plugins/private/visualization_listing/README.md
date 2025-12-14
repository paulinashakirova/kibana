# Visualization Listing Plugin

This plugin handles the integration between the Visualizations and Dashboard plugins by registering the Visualizations tab in the Dashboard listing view.

## Pattern

This follows the same pattern as `eventAnnotationListing`, which integrates annotation groups into both visualizations and dashboard listing views.

### Plugin Dependencies

**Required:**

- `visualizations` - provides the tab content and functionality
- `embeddable` - needed for visualizations rendering

**Optional:**

- `dashboard` - receives the tab registration (gracefully skipped if not present)
- `savedObjectsTaggingOss` - for tagging functionality

## Implementation

In `setup()`:

```typescript
if (dependencies.dashboard) {
  dependencies.dashboard.listingViewRegistry.add(visualizationsTabConfig);
}
```

The tab configuration dynamically imports from:

```typescript
'@kbn/visualizations-plugin/public/visualization_listing';
```

This import works because visualizations exposes this directory via `extraPublicDirs` in its `kibana.jsonc`.

## Related Plugins

- `@kbn/visualizations-plugin` - provides the visualization listing tab component
- `@kbn/dashboard-plugin` - provides the listing view registry
