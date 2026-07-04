import { redirect } from "next/navigation";
import { mondayOfWeekISO, todayISO } from "@/lib/format";

// /week -> current week's Monday
export default function WeekIndex() {
  redirect(`/week/${mondayOfWeekISO(todayISO())}`);
}
