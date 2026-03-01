import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "manapool seller reconciliation",
  { minutes: 15 },
  internal.manapool.actions.reconcileSellerData,
  {},
);

export default crons;
