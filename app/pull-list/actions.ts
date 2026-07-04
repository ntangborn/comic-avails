"use server";

import { revalidatePath } from "next/cache";
import { serviceClient } from "@/lib/supabase/server";
import { getOrCreatePullListId } from "@/lib/pull-list";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function revalidateAll() {
  revalidatePath("/");
  revalidatePath("/pull-list");
}

/** Add an item to the pull list (idempotent — re-adding keeps existing qty). */
export async function addToPullList(itemId: number): Promise<ActionResult> {
  const listId = await getOrCreatePullListId();
  if (!listId) {
    return {
      ok: false,
      error:
        "Pull list not configured. Set SUPABASE_SECRET_KEY and DEMO_USER_ID in .env.local.",
    };
  }
  try {
    const db = serviceClient();
    const { error } = await db
      .from("pull_list_items")
      .upsert(
        { pull_list_id: listId, item_id: itemId, qty: 1, state: "want" },
        { onConflict: "pull_list_id,item_id", ignoreDuplicates: true },
      );
    if (error) throw error;
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function removeFromPullList(itemId: number): Promise<ActionResult> {
  const listId = await getOrCreatePullListId();
  if (!listId) return { ok: false, error: "Pull list not configured." };
  try {
    const db = serviceClient();
    const { error } = await db
      .from("pull_list_items")
      .delete()
      .eq("pull_list_id", listId)
      .eq("item_id", itemId);
    if (error) throw error;
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Set quantity; qty <= 0 removes the line. */
export async function setPullListQty(
  itemId: number,
  qty: number,
): Promise<ActionResult> {
  if (qty <= 0) return removeFromPullList(itemId);
  const listId = await getOrCreatePullListId();
  if (!listId) return { ok: false, error: "Pull list not configured." };
  try {
    const db = serviceClient();
    const { error } = await db
      .from("pull_list_items")
      .update({ qty })
      .eq("pull_list_id", listId)
      .eq("item_id", itemId);
    if (error) throw error;
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
