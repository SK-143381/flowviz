/**
 * The sample retail/warehouse star schema used for "Load default schema". Expressed as
 * Mermaid erDiagram DSL and parsed through the same pure parser real uploads go through, so
 * this is also a live regression check on mermaidErParser.ts.
 */

import { parseMermaidErDiagram } from './mermaidErParser';
import type { SchemaModel } from './entities';

export const DEFAULT_SCHEMA_DSL = `erDiagram
CUSTOMER_DIMENSION ||--o{ WEB_SALES : "customer_sk"
CUSTOMER_DIMENSION ||--o{ CATALOG_SALES : "customer_sk"
DATE_DIMENSION ||--o{ INVENTORY_FACT : "date_sk"
DATE_DIMENSION ||--o{ WEB_SALES : "date_sk"
DATE_DIMENSION ||--o{ CATALOG_SALES : "date_sk"
ITEM_DIMENSION ||--o{ INVENTORY_FACT : "item_sk"
ITEM_DIMENSION ||--o{ WEB_SALES : "item_sk"
ITEM_DIMENSION ||--o{ CATALOG_SALES : "item_sk"
WAREHOUSE_DIMENSION ||--o{ INVENTORY_FACT : "warehouse_sk"
WAREHOUSE_DIMENSION ||--o{ WEB_SALES : "warehouse_sk"
WAREHOUSE_DIMENSION ||--o{ CATALOG_SALES : "warehouse_sk"
PROMOTION_DIMENSION ||--o{ WEB_SALES : "promo_sk"
PROMOTION_DIMENSION ||--o{ CATALOG_SALES : "promo_sk"

INVENTORY_FACT {
    int inventory_id PK
    int inventory_date_sk FK
    int item_sk FK
    int warehouse_sk FK
    int quantity
    int units_on_hand
}

WEB_SALES {
    int web_sales_id PK
    int ws_sold_date_sk FK
    int ws_item_sk FK
    int ws_bill_customer_sk FK
    int ws_ship_customer_sk FK
    int ws_warehouse_sk FK
    int ws_promo_sk FK
    decimal ws_sales_price
    decimal ws_extended_price
}

CATALOG_SALES {
    int catalog_sales_id PK
    int cs_sold_date_sk FK
    int cs_item_sk FK
    int cs_bill_customer_sk FK
    int cs_ship_customer_sk FK
    int cs_warehouse_sk FK
    int cs_promo_sk FK
    decimal cs_sales_price
    decimal cs_extended_price
}

CUSTOMER_DIMENSION {
    int customer_sk PK
    string customer_id
    string customer_name
    string customer_city
    string customer_state
}

DATE_DIMENSION {
    int date_sk PK
    string date_id
    date calendar_date
    int year
    int month
    int day
}

ITEM_DIMENSION {
    int item_sk PK
    string item_id
    string item_name
    string item_category
    decimal item_price
}

WAREHOUSE_DIMENSION {
    int warehouse_sk PK
    string warehouse_id
    string warehouse_name
    string warehouse_city
    string warehouse_state
}

PROMOTION_DIMENSION {
    int promo_sk PK
    string promo_id
    string promo_name
    decimal promo_discount_percent
    string promo_channel
}
`;

export function loadDefaultSchema(): SchemaModel {
  return parseMermaidErDiagram(DEFAULT_SCHEMA_DSL);
}
