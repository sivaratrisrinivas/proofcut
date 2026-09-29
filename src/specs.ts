import productsJson from "../specs/products.json" with { type: "json" };
import type { ProductSpec } from "./preflight";

const products = (productsJson as { products: ProductSpec[] }).products;
const byId = new Map(products.map((p) => [p.id, p]));

export function getSpec(productId: string): ProductSpec {
  const spec = byId.get(productId);
  if (!spec) throw new Error(`unknown product: ${productId}`);
  return spec;
}

export function listSpecs(): ProductSpec[] {
  return products;
}
