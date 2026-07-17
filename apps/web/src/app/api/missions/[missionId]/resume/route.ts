import { missionAction } from "../_action";

export async function POST(_: Request, { params }: { params: Promise<{ missionId: string }> }) {
  return missionAction(params, "resume");
}
