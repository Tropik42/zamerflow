import type { DadataCleanAddressResult, DadataClient } from "../integrations/dadataClient.js";
import type { AddressGeoSnapshot, BeltwayHit } from "../types/order.js";

export interface AddressGeoService {
  enrichAddress(address: string | undefined): Promise<AddressGeoSnapshot | undefined>;
}

export function createAddressGeoService(params: {
  enabled: boolean;
  dadataClient?: DadataClient;
}): AddressGeoService {
  return {
    async enrichAddress(address) {
      const trimmedAddress = address?.trim();

      if (!params.enabled || !trimmedAddress || !params.dadataClient) {
        return undefined;
      }

      try {
        const result = await params.dadataClient.cleanAddress(trimmedAddress);
        return result ? mapDadataAddress(result) : undefined;
      } catch (error) {
        console.warn(
          `DaData address enrichment failed: address_length=${trimmedAddress.length}, message=${safeErrorMessage(error)}`
        );
        return undefined;
      }
    }
  };
}

function mapDadataAddress(result: DadataCleanAddressResult): AddressGeoSnapshot {
  return {
    source: "dadata",
    normalizedAddress: normalizeString(result.result),
    beltwayHit: normalizeBeltwayHit(result.beltway_hit),
    beltwayDistanceKm: normalizeNumber(result.beltway_distance),
    qcGeo: normalizeNumber(result.qc_geo),
    qc: normalizeNumber(result.qc),
    qcHouse: normalizeNumber(result.qc_house)
  };
}

function normalizeBeltwayHit(value: string | undefined): BeltwayHit {
  if (value === "IN_MKAD" || value === "OUT_MKAD" || value === "IN_KAD" || value === "OUT_KAD") {
    return value;
  }

  return "UNKNOWN";
}

function normalizeString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeNumber(value: string | number | undefined): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
