import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "manapool seller reconciliation",
  { minutes: 15 },
  internal.manapool.actions.reconcileSellerData,
  {},
);

crons.interval(
  "tcgplayer seller reconciliation",
  { minutes: 15 },
  internal.tcgplayer.actions.reconcileData,
  {},
);

export default crons;
