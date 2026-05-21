# Packaging Module Documentation

## Overview
The Packaging Module allows you to manage product packaging configurations and record packaging collection events. This enables you to track how products are packaged and automatically update inventory accordingly.

## Features

1. **Packaging Items** - Define packaging containers/items (e.g., Egg Tray, Product Basket)
2. **Product Packaging Configuration** - Link packaging items to products with unit specifications
3. **Packaging Collection** - Record packaging events that reduce product inventory and track packaged items
4. **Packaging Management Page** - User-friendly interface for managing all packaging operations

## Components

### 1. Packaging Item DocType
Defines the physical packaging containers used for products.

**Fields:**
- `Packaging Item Name` (Text, Required, Unique) - Name of the container (e.g., "Egg Tray 30-Pc")
- `Capacity` (Float, Required) - How many units the container can hold
- `Default UOM` (Link to UOM, Required) - Unit of measure for the capacity
- `Notes` (Text) - Additional information

**Example:**
```
Name: Egg Tray 30-Pc
Capacity: 30
UOM: Nos
```

### 2. Product Packaging Config DocType
Links products to packaging items with configuration details.

**Fields:**
- `Product Type` (Select, Required) - "Crop Product" or "Animal Product"
- `Product` (Dynamic Link, Required) - The product to package (e.g., Eggs)
- `Packaging Item` (Link to Packaging Item, Required) - The container to use
- `Units Per Package` (Float, Required) - How many product units fit in one package
- `Notes` (Text) - Additional notes

**Example:**
```
Product Type: Animal Product
Product: Eggs
Packaging Item: Egg Tray 30-Pc
Units Per Package: 30
```

### 3. Packaging Collection DocType
Records the actual packaging events. When submitted, it automatically:
- Creates Stock Entries to reduce product inventory
- Calculates number of packages created
- Maintains reference to stock movements

**Fields:**
- `Date` (Date, Required, Default: Today) - When the packaging occurred
- `Notes` (Text) - General notes about the batch
- `Packaging Line Items` (Child Table) - Products being packaged

**Child Table Fields (Packaging Collection Item):**
- `Product Type` (Select) - "Crop Product" or "Animal Product"
- `Product` (Dynamic Link) - The product being packaged
- `Quantity to Package` (Float) - How many units to package
- `Packaging Item` (Link) - The container to use
- `Units Per Package` (Float, Read-only) - Auto-filled from configuration
- `Packages Created` (Float, Read-only) - Calculated: Quantity / Units Per Package
- `Stock Entry Reference` (Link, Read-only) - Reference to the Stock Entry created

## Workflow

### Step 1: Create Packaging Items
1. Go to **Packaging Management** page
2. Click **New Packaging Item**
3. Enter:
   - **Name**: "Egg Tray 30-Pc"
   - **Capacity**: 30
   - **UOM**: Nos
4. Click **Save**

### Step 2: Configure Product Packaging
1. Go to **Packaging Management** page
2. Click **New Configuration**
3. Select:
   - **Product Type**: "Animal Product"
   - **Product**: "Eggs"
   - **Packaging Item**: "Egg Tray 30-Pc"
   - **Units Per Package**: 30
4. Click **Save**

### Step 3: Record Packaging Events
1. Go to **Packaging Management** page
2. Click **New Packaging Collection**
3. Set the **Date** of packaging
4. Add items to the packaging line:
   - Select **Product Type**: "Animal Product"
   - Select **Product**: "Eggs" (configuration will auto-populate)
   - Enter **Quantity to Package**: 300
   - **Packages Created** will auto-calculate: 300 / 30 = 10
5. Click **Save** to create Stock Entry
6. Click **Submit** to finalize

**Result**: 
- 300 units of Eggs are removed from inventory
- 10 packages are recorded in the Packaging Collection

## API Methods

### get_packaging_config(product_type, product)
Returns available packaging configurations for a product.

**Example:**
```python
frappe.call({
    method: 'farm_management_system.savanna_farm_suite.doctype.packaging_collection.packaging_collection.get_packaging_config',
    args: {
        product_type: 'Animal Product',
        product: 'Eggs'
    },
    callback: function(r) {
        console.log(r.message); // [{name: 'PPC-...', packaging_item: '...', units_per_package: 30}]
    }
})
```

## Database Schema

### Packaging Item Table
```sql
CREATE TABLE `tabPackaging Item` (
  `name` varchar(120) PRIMARY KEY,
  `packaging_item_name` varchar(255) UNIQUE,
  `capacity` float,
  `default_uom` varchar(120),
  `notes` longtext
);
```

### Product Packaging Config Table
```sql
CREATE TABLE `tabProduct Packaging Config` (
  `name` varchar(120) PRIMARY KEY,
  `product_type` varchar(120),
  `product` varchar(120),
  `packaging_item` varchar(120),
  `units_per_package` float,
  `notes` longtext
);
```

### Packaging Collection Table
```sql
CREATE TABLE `tabPackaging Collection` (
  `name` varchar(120) PRIMARY KEY,
  `date` date,
  `notes` longtext,
  `docstatus` int DEFAULT 0
);
```

### Packaging Collection Item Table (Child Table)
```sql
CREATE TABLE `tabPackaging Collection Item` (
  `name` varchar(120) PRIMARY KEY,
  `parent` varchar(120),
  `parentfield` varchar(120),
  `parenttype` varchar(120),
  `idx` int,
  `product_type` varchar(120),
  `product` varchar(120),
  `quantity_to_package` float,
  `packaging_item` varchar(120),
  `units_per_package` float,
  `packages_created` float,
  `stock_entry_reference` varchar(120)
);
```

## User Interface

### Packaging Management Page
Located at `/app/packaging-management`

Features:
- **Quick Actions**: Buttons to create new items, configurations, and collections
- **Recent Collections**: Table showing latest packaging collections
- **Cards for Each Section**: 
  - Create Packaging Item
  - View Packaging Items
  - Configure Product Packaging
  - Record Packaging Collection

## Integration Points

### Stock Inventory
- Packaging Collections automatically create Stock Entries
- Reduces source product quantity
- Integrates with Frappe's inventory system

### Product Management
- Works with existing Crop Products and Animal Products
- Uses product item codes for inventory operations

## Best Practices

1. **Create Standardized Packaging Items**
   - Use clear, descriptive names
   - Include capacity in the name if possible

2. **Configure All Products**
   - Set up packaging configurations for all products that need packaging
   - Can have multiple packaging options per product

3. **Regular Packaging Records**
   - Record packaging events daily or as they occur
   - Always specify the correct date of packaging

4. **Quantity Management**
   - Ensure sufficient inventory before packaging
   - System will track all packaging history

## Troubleshooting

### Issue: "No packaging configuration found for this product"
- Ensure you've created a Product Packaging Config for the selected product
- Check that the product type is correct (Crop Product vs Animal Product)

### Issue: Stock Entry not being created
- Verify the product exists as an Item in the system
- Check that a default warehouse is configured
- Review error logs for detailed information

### Issue: Quantity calculations are incorrect
- Verify the "Units Per Package" value in the configuration
- Check that the quantity entered is in the correct UOM
- Recalculate manually: Packages = Quantity / Units Per Package

## Future Enhancements

Potential features to add:
- Package labeling/barcoding
- Packaging waste tracking
- Cost analysis by packaging method
- Packaging material inventory management
- Batch/lot tracking through packages
- Quality inspection checkpoints
- Packaging efficiency reports

## Support

For issues or questions, contact the development team or refer to the app documentation.
