import "server-only";
import { serviceClient, pullListConfigured } from "@/lib/supabase/server";
import { ITEM_SELECT, mapItem } from "@/lib/catalog";
import type { PullListLine } from "@/lib/types";

/**
 * Pull list persistence for the single hardcoded demo user (auth comes later).
 *
 * pull_lists.user_id is a FK to auth.users(id), so DEMO_USER_ID must be the UUID
 * of a real Supabase Auth user. Create one in the Supabase dashboard
 * (Authentication → Add user) and put its id in .env.local as DEMO_USER_ID.
 * Optional: PULL_LIST_SHOP_NAME, PULL_LIST_CUSTOMER_NAME.
 *
 * All writes go through the service (secret) key, which bypasses RLS.
 */

const PULL_ITEM_SELECT = `id, qty, state, added_at, item:item_id ( ${ITEM_SELECT} )`;

export async function getOrCreatePullListId(): Promise<number | null> {
  if (!pullListConfigured()) return null;
  const userId = process.env.DEMO_USER_ID!;
  try {
    const db = serviceClient();
    const { data: existing } = await db
      .from("pull_lists")
      .select("id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (existing) return existing.id as number;

    const { data: created, error } = await db
      .from("pull_lists")
      .insert({
        user_id: userId,
        shop_name: process.env.PULL_LIST_SHOP_NAME ?? null,
        customer_name: process.env.PULL_LIST_CUSTOMER_NAME ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    return created.id as number;
  } catch (e) {
    console.error("getOrCreatePullListId failed:", (e as Error).message);
    return null;
  }
}

export async function getPullListLines(): Promise<PullListLine[]> {
  const listId = await getOrCreatePullListId();
  if (!listId) return [];
  try {
    const db = serviceClient();
    const { data, error } = await db
      .from("pull_list_items")
      .select(PULL_ITEM_SELECT)
      .eq("pull_list_id", listId)
      .order("added_at", { ascending: true });
    if (error) throw error;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    return (data ?? [])
      .filter((row: any) => row.item)
      .map((row: any) => ({
        pull_list_item_id: row.id as number,
        qty: row.qty as number,
        state: row.state as string,
        item: mapItem(row.item),
      }));
    /* eslint-enable @typescript-eslint/no-explicit-any */
  } catch (e) {
    console.error("getPullListLines failed:", (e as Error).message);
    return [];
  }
}

/** Set of item ids already on the pull list — used to show "Added" state. */
export async function getPullListItemIds(): Promise<Set<number>> {
  const listId = await getOrCreatePullListId();
  if (!listId) return new Set();
  try {
    const db = serviceClient();
    const { data, error } = await db
      .from("pull_list_items")
      .select("item_id")
      .eq("pull_list_id", listId);
    if (error) throw error;
    return new Set((data ?? []).map((r: { item_id: number }) => r.item_id));
  } catch {
    return new Set();
  }
}
