import {createHash} from "node:crypto";
import type {BlobArtifactKind} from "@/lib/blob-core.ts";
export const ARTIFACT_MAX_BYTES=10*1024*1024;
export const artifactMimeTypes={"letter-pdf":"application/pdf","privacy-export":"application/zip","audit-snapshot":"application/json"} as const satisfies Record<BlobArtifactKind,string>;
export function validateArtifact(kind:BlobArtifactKind,body:Uint8Array,mimeType:string){if(!body.byteLength||body.byteLength>ARTIFACT_MAX_BYTES)throw new Error("ARTIFACT_SIZE_INVALID");if(artifactMimeTypes[kind]!==mimeType)throw new Error("ARTIFACT_TYPE_INVALID");return{sha256:createHash("sha256").update(body).digest("hex"),size:body.byteLength};}
export function retentionUntil(kind:BlobArtifactKind,now=new Date()){const days=kind==="privacy-export"?7:365;return new Date(now.getTime()+days*86400_000);}
