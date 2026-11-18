import { describe, it, expect, vi } from "vitest";
import { openAiLiveReadiness, openAiShadowReadiness, openAiPreviewReadiness, createOpenAiLiveCopilot } from "@/copilot/openai";
import { getCopilot } from "@/copilot";
import { isLivePilotRuntimeEnabled, isLivePilotRuntimeReady } from "@/pilot/runtime";
import { effectiveVaultPricing, priceAllowed, adaptivePrice } from "@/sales/pricing";
describe("public edition boundaries", () => {
    it("cannot enable private providers through environment settings", () => { expect(openAiLiveReadiness().ready).toBe(false); expect(openAiShadowReadiness().ready).toBe(false); expect(openAiPreviewReadiness().ready).toBe(false); expect(isLivePilotRuntimeEnabled()).toBe(false); expect(isLivePilotRuntimeReady()).toBe(false); });
    it("cannot call a provider or recover private behavior", () => { const spy = vi.spyOn(globalThis, "fetch"); expect(() => getCopilot()).toThrow("AUTOMATION_NOT_DISTRIBUTED"); expect(() => createOpenAiLiveCopilot()).toThrow("AUTOMATION_NOT_DISTRIBUTED"); expect(spy).not.toHaveBeenCalled(); spy.mockRestore(); });
    it("uses only operator-set fixed prices", () => { const pricing = effectiveVaultPricing({ defaultPriceCents: 1000, approvedPriceCents: 1500 }); expect(pricing.basePriceCents).toBe(1500); expect(pricing.minPriceCents).toBe(1500); expect(pricing.maxPriceCents).toBe(1500); expect(priceAllowed({ requestedPriceCents: 1500, aiMode: "NONE", pricing, globalPriceCapCents: 5000 })).toBe(true); expect(priceAllowed({ requestedPriceCents: 1500, aiMode: "AUTO", pricing, globalPriceCapCents: 5000 })).toBe(false); expect(() => adaptivePrice({})).toThrow("AUTOMATION_NOT_DISTRIBUTED"); });
});

describe("public source has no mock conversation corpus",()=>{
 it("returns no generated conversations or template messages",async()=>{
  const {generateDataset,generateLiveIncoming}=await import("@/platform/mock/generator");
  expect(generateDataset("synthetic-account")).toEqual({vaultItems:[],fans:[]});
  expect(generateLiveIncoming("synthetic-account")).toBeNull();
 });
 it("does not fabricate successful mock sends",async()=>{
  const {mockAdapter}=await import("@/platform/mock/mock-adapter");
  expect(await mockAdapter.sendMessage({} as never,"synthetic-fan",{body:"synthetic"})).toMatchObject({ok:false,errorCode:"MOCK_NOT_DISTRIBUTED"});
 });
});
