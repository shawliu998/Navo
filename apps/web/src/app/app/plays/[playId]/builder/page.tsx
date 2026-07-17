import { notFound } from "next/navigation";
import { DEMO_WORKSPACE_ID, getPlay } from "@navo/db/queries";
import { PlayBuilder } from "@/components/play-builder";
export default async function BuilderPage({params}:{params:Promise<{playId:string}>}){const {playId}=await params;const data=await getPlay(DEMO_WORKSPACE_ID,playId);if(!data||!data.version)notFound();const graph=data.version.graph as Parameters<typeof PlayBuilder>[0]["initialGraph"];return <PlayBuilder playId={playId} name={data.play.name} status={data.version.status} initialGraph={graph} versionNumber={data.version.versionNumber}/>}
