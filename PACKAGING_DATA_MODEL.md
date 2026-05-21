# Packaging Module - Data Model & Architecture

## Entity-Relationship Diagram

```
┌──────────────────────────┐
│   Packaging Item         │ (Master Data)
├──────────────────────────┤
│ • name (PK)              │
│ • packaging_item_name    │
│ • capacity               │
│ • default_uom (FK)       │
│ • notes                  │
└──────────────────────────┘
          │
          │ (1:N)
          │
          ▼
┌──────────────────────────────────┐
│ Product Packaging Config         │ (Configuration)
├──────────────────────────────────┤
│ • name (PK)                      │
│ • product_type                   │
│ • product (FK)                   │
│ • packaging_item (FK)            │
│ • units_per_package              │
│ • notes                          │
└──────────────────────────────────┘
          │
          │ (1:N)
          │
          ▼
┌────────────────────────────────────┐
│ Packaging Collection               │ (Transaction)
├────────────────────────────────────┤
│ • name (PK)                        │
│ • date                             │
│ • notes                            │
│ • docstatus                        │
│ • created, modified                │
└────────────────────────────────────┘
          │
          │ (1:N)
          │
          ▼
┌───────────────────────────────────────┐
│ Packaging Collection Item             │ (Child Table)
├───────────────────────────────────────┤
│ • name (PK)                           │
│ • parent (FK -> Packaging Collection) │
│ • product_type                        │
│ • product (FK)                        │
│ • quantity_to_package                 │
│ • packaging_item (FK)                 │
│ • units_per_package (computed)        │
│ • packages_created (computed)         │
│ • stock_entry_reference (FK)          │
└───────────────────────────────────────┘
          │
          │ (Creates)
          │
          ▼
┌────────────────────────┐
│ Stock Entry            │ (Frappe Built-in)
├────────────────────────┤
│ • name (PK)            │
│ • items (child table)  │
│ • posting_date         │
│ • docstatus           │
└────────────────────────┘
```

## Complete Data Model

### Master Data Hierarchy
```
UOM (Base)
 ├─ Packaging Item (container definitions)
 └─ Items (products - from Crop Products or Animal Products)

Crop Products / Animal Products (Product Masters)
 │
 ├─ Product Packaging Config (N configurations per product)
 │   └─ Packaging Item (which container to use)
 │
 └─ Packaging Collection (N collections per product)
     └─ Child Items (N items per collection)
         └─ Stock Entry (1 per child item on submit)
```

## Class Diagram

```
┌─────────────────────────────────────┐
│      PackagingItem (Document)       │
├─────────────────────────────────────┤
│ + packaging_item_name: str          │
│ + capacity: float                   │
│ + default_uom: str                  │
│ + notes: str                        │
├─────────────────────────────────────┤
│ + validate()                        │
│ + after_insert()                    │
│ + on_update()                       │
└─────────────────────────────────────┘

┌──────────────────────────────────────────┐
│   ProductPackagingConfig (Document)      │
├──────────────────────────────────────────┤
│ + product_type: str (Crop/Animal)       │
│ + product: str                          │
│ + packaging_item: str                   │
│ + units_per_package: float              │
│ + notes: str                            │
├──────────────────────────────────────────┤
│ + validate()                            │
│ + check_duplicates()                    │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│    PackagingCollection (Document)        │
├──────────────────────────────────────────┤
│ + date: date                            │
│ + notes: str                            │
│ + packaging_line_items: list[]          │
├──────────────────────────────────────────┤
│ + on_submit()                           │
│ + on_cancel()                           │
│ + update_inventory(line)                │
│ + reverse_inventory(line)               │
│ + get_default_warehouse()               │
│ + get_packaging_config()                │ (static)
└──────────────────────────────────────────┘

┌────────────────────────────────────────┐
│  PackagingCollectionItem (Row)         │
├────────────────────────────────────────┤
│ + product_type: str                    │
│ + product: str                         │
│ + quantity_to_package: float           │
│ + packaging_item: str                  │
│ + units_per_package: float (computed)  │
│ + packages_created: float (computed)   │
│ + stock_entry_reference: str           │
├────────────────────────────────────────┤
│ + validate()                           │
│ + auto_populate_config()               │
└────────────────────────────────────────┘
```

## Data Flow Diagram

### Creation Flow
```
┌─────────────────────────────────────────┐
│ 1. User Creates Packaging Item          │
│    (e.g., "Egg Tray 30-Pc")            │
└────────────────┬────────────────────────┘
                 │
                 ▼
         ┌───────────────────┐
         │ Save to Database  │
         │ in tabPackaging   │
         │ Item              │
         └───────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│ 2. User Creates Product Config          │
│    (Links Product → Packaging Item)     │
└────────────────┬────────────────────────┘
                 │
                 ▼
         ┌───────────────────┐
         │ Save to Database  │
         │ in tabProduct     │
         │ Packaging Config  │
         └───────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│ 3. User Creates Packaging Collection    │
│    (Records packaging event)            │
└────────────────┬────────────────────────┘
                 │
                 ▼
         ┌───────────────────────────┐
         │ Add Line Items            │
         │ (Qty to package, etc.)    │
         └───────────┬───────────────┘
                     │
                     ▼
         ┌───────────────────────────┐
         │ Auto-Calculate:           │
         │ • Packages Created        │
         │ • Units Per Package       │
         └───────────┬───────────────┘
                     │
                     ▼
         ┌───────────────────────────┐
         │ Save to Database          │
         │ (Draft Status)            │
         └───────────┬───────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│ 4. User Submits Collection              │
└────────────────┬────────────────────────┘
                 │
                 ▼
         ┌───────────────────────────┐
         │ For Each Line Item:       │
         │ • Create Stock Entry      │
         │ • Reduce Product Stock    │
         │ • Store Reference         │
         └───────────┬───────────────┘
                     │
                     ▼
         ┌───────────────────────────┐
         │ Update Inventory          │
         │ (via Stock Entry)         │
         └───────────┬───────────────┘
                     │
                     ▼
         ┌───────────────────────────┐
         │ Mark as Submitted         │
         │ (docstatus = 1)           │
         └───────────────────────────┘
```

### Rollback Flow
```
┌──────────────────────────────────────────┐
│ User Cancels Packaging Collection       │
└───────────────┬──────────────────────────┘
                │
                ▼
        ┌──────────────────────┐
        │ For Each Line Item:  │
        │ Fetch Stock Entry    │
        │ Reference            │
        └──────────┬───────────┘
                   │
                   ▼
        ┌──────────────────────────────┐
        │ Cancel Stock Entry           │
        │ (Reverse Inventory Changes)  │
        └──────────┬───────────────────┘
                   │
                   ▼
        ┌──────────────────────────────┐
        │ Mark as Cancelled            │
        │ (docstatus = 2)              │
        └──────────────────────────────┘
```

## State Diagram

### Packaging Collection States
```
           ┌─────────────┐
           │ New/Draft   │
           │ (docstatus) │
           │    = 0      │
           └──────┬──────┘
                  │
      ┌───────────┴──────────────┐
      │                          │
      ▼                          ▼
  ┌────────────┐         ┌──────────────┐
  │ Saved      │         │ Discarded    │
  │ (Ready to  │         │ (Deleted)    │
  │  Submit)   │         └──────────────┘
  └─────┬──────┘
        │
        ▼ (Submit)
  ┌──────────────┐
  │ Submitted    │ ← Stock Entries Created
  │ (docstatus)  │
  │    = 1       │
  └──────┬───────┘
         │
         ▼ (Cancel)
  ┌──────────────┐
  │ Cancelled    │ ← Stock Entries Cancelled
  │ (docstatus)  │
  │    = 2       │
  └──────────────┘
```

## Database Relationships

### Foreign Key Relationships
```
Product Packaging Config.product_type → Text (not a FK)
Product Packaging Config.product → Crop Products / Animal Products (Dynamic Link)
Product Packaging Config.packaging_item → Packaging Item

Packaging Collection Item.product_type → Text (not a FK)
Packaging Collection Item.product → Crop Products / Animal Products (Dynamic Link)
Packaging Collection Item.packaging_item → Packaging Item
Packaging Collection Item.parent → Packaging Collection
Packaging Collection Item.stock_entry_reference → Stock Entry
```

### Index Strategy
```
Primary Keys:
  - tabPackaging Item: name (unique)
  - tabProduct Packaging Config: name (unique)
  - tabPackaging Collection: name (unique)
  - tabPackaging Collection Item: name (unique)

Foreign Keys:
  - Packaging Collection Item.parent (child table)
  - Packaging Item references UOM

Search Indexes:
  - Packaging Item: packaging_item_name
  - Product Packaging Config: product, packaging_item
  - Packaging Collection: date (for date-range queries)
```

## Calculation Flows

### Package Creation Calculation
```
packages_created = floor(quantity_to_package / units_per_package)

Example:
  quantity_to_package = 300 eggs
  units_per_package = 30 eggs/tray
  packages_created = floor(300 / 30) = 10 trays
```

### Inventory Update Calculation
```
When Submitted:
  ├─ item_quantity = quantity_to_package
  ├─ stock_uom = from Item master
  └─ warehouse = default warehouse
  
Stock Entry Created:
  ├─ Type: "Material Issue"
  ├─ Item: product (from line item)
  ├─ Quantity: quantity_to_package
  ├─ UOM: stock_uom
  └─ Warehouse: default_warehouse
```

## Validation Rules

### Packaging Item
```
1. packaging_item_name: Required, Unique
2. capacity: Required, > 0
3. default_uom: Required, must exist in UOM table
```

### Product Packaging Config
```
1. product_type: Required, valid select option
2. product: Required, must exist in specified product type
3. packaging_item: Required, must exist in Packaging Item
4. units_per_package: Required, > 0
5. Unique combination of (product_type, product, packaging_item)
```

### Packaging Collection
```
1. date: Required, cannot be in future
2. Line items: At least 1 required
   ├─ product_type: Required
   ├─ product: Required, must exist
   ├─ quantity_to_package: Required, > 0
   ├─ packaging_item: Required, must exist
   └─ Configuration must exist for the combo
```

## Performance Considerations

### Query Optimization
```
Frequently Used Queries:
  1. Get packaging configs for a product
     → Index on (product_type, product)
     
  2. Get recent collections
     → Index on creation/modified DESC
     
  3. Find collections by date
     → Index on date
```

### Caching Strategy
- PackagingItem list: Low change frequency → Can cache
- ProductPackagingConfig: Low change frequency → Can cache
- PackagingCollection: High change frequency → Don't cache

### Batch Operations
- For large quantities: Create multiple line items
- System handles each in separate Stock Entry (safe)
- Consider pagination for large lists

## Integration Architecture

### Stock Integration
```
Packaging Collection (Our System)
         │
         │ Creates on Submit
         ▼
    Stock Entry (Frappe)
         │
         │ Reduces Inventory
         ▼
    Item Ledger Entry (Frappe)
         │
         │ Updates Balance
         ▼
    Item Master (Frappe)
         │
         └─ Updated Stock Qty
```

### Search Integration
```
DocType Search
  ├─ Packaging Item: searchable by name
  ├─ Product Packaging Config: searchable by product
  └─ Packaging Collection: searchable by ID
```

## Security Model

### Field-Level Permissions
```
Read-Only Fields (Auto-calculated):
  - units_per_package
  - packages_created
  - stock_entry_reference
  
Can only be set via configuration/system
```

### Workflow Security
```
User cannot:
  - Modify submitted documents (docstatus = 1)
  - Manually set calculated fields
  - Create stock entries (system does it)
  - Bypass warehouse requirement

User can:
  - Create draft collections
  - Modify before submit
  - Cancel submitted documents
  - View audit trail via stock entries
```

## Scalability Notes

### Expected Scale
- Packaging Items: 10-1000 items
- Configurations: 10-5000 configs
- Collections: 1000s per year (manageable)
- Child Items: 10-100 per collection

### Performance at Scale
- List views: Fast (< 1 second for 10k records)
- Form loads: Fast (< 1 second)
- Stock entry creation: Medium (1-2 seconds)

### Optimization Paths
1. Archive old collections (> 1 year)
2. Create summary reports instead of filtering
3. Batch process multiple items
4. Use Stock Entry batching (Frappe feature)

---

This data model is designed for clarity, maintainability, and operational efficiency while integrating seamlessly with Frappe's existing systems.
