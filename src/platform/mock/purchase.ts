import "server-only";
import type {TenantDb} from "@/lib/tenant-db";
export type MockPurchaseResult={ok:true;duplicate:boolean;transactionId:string;conversationId:string}|{ok:false;code:"NOT_FOUND"|"NOT_MOCK"|"NOT_AI_PPV"|"DELIVERY_NOT_SENT"};
export function isMockPurchaseEnabled(_env:NodeJS.ProcessEnv=process.env):boolean {return false;}
export async function simulateMockPurchase(_tdb:TenantDb,_input:{agencyId:string;vaultSendId:string;actorUserId:string;now?:Date}):Promise<MockPurchaseResult>{return {ok:false,code:"NOT_MOCK"};}
