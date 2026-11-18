import type {FanDTO,MessageDTO,TransactionDTO,VaultItemDTO} from "@/platform/adapter";
export interface MockFanData extends FanDTO {messages: MessageDTO[];transactions:TransactionDTO[]}
export interface MockDataset {vaultItems:VaultItemDTO[];fans:MockFanData[]}
export function generateDataset(_accountRef:string,_now:Date=new Date()):MockDataset {return {vaultItems:[],fans:[]};}
export function clearDatasetCache():void {}
export function generateLiveIncoming(_accountRef:string):{fanExternalRef:string;message:MessageDTO}|null {return null;}
