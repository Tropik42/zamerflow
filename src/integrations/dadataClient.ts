import { logError, logInfo, truncateForLog } from "../logger.js";

export interface DadataCleanAddressResult {
  result?: string;
  beltway_hit?: string;
  beltway_distance?: string | number;
  qc_geo?: string | number;
  qc?: string | number;
  qc_house?: string | number;
}

export interface DadataClient {
  cleanAddress(address: string): Promise<DadataCleanAddressResult | undefined>;
}

export class DadataHttpError extends Error {
  constructor(public readonly status: number) {
    super(`DaData Clean Address request failed with status ${status}.`);
    this.name = "DadataHttpError";
  }
}

export function createDadataClient(params: {
  apiKey: string;
  secretKey: string;
  timeoutMs: number;
}): DadataClient {
  return {
    async cleanAddress(address) {
      const controller = new AbortController();
      const startedAt = Date.now();
      const addressLength = address.length;
      let httpStatus: number | undefined;
      let failureLogged = false;
      const timeout = setTimeout(() => {
        controller.abort();
      }, params.timeoutMs);

      try {
        logInfo("dadata_address_request_started", {
          address_length: addressLength,
          timeout_ms: params.timeoutMs
        });

        const response = await fetch("https://cleaner.dadata.ru/api/v1/clean/address", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Token ${params.apiKey}`,
            "X-Secret": params.secretKey
          },
          body: JSON.stringify([address]),
          signal: controller.signal
        });
        httpStatus = response.status;

        if (!response.ok) {
          const error = new DadataHttpError(response.status);
          logDadataFailure(error, startedAt, addressLength, httpStatus);
          failureLogged = true;
          throw error;
        }

        const data = (await response.json()) as unknown;

        if (!Array.isArray(data)) {
          return undefined;
        }

        const first = data[0];
        if (!first || typeof first !== "object") {
          return undefined;
        }

        const result = first as DadataCleanAddressResult;
        logInfo("dadata_address_request_succeeded", {
          duration_ms: Date.now() - startedAt,
          http_status: httpStatus,
          field_count: Object.keys(first).length,
          normalized_address: truncateForLog(result.result, 200),
          beltway_hit: result.beltway_hit,
          beltway_distance_km: result.beltway_distance,
          qc_geo: result.qc_geo,
          qc_house: result.qc_house
        });

        return result;
      } catch (error) {
        if (!failureLogged) {
          logDadataFailure(error, startedAt, addressLength, httpStatus);
        }

        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}

function logDadataFailure(
  error: unknown,
  startedAt: number,
  addressLength: number,
  httpStatus: number | undefined
): void {
  logError("dadata_address_request_failed", {
    duration_ms: Date.now() - startedAt,
    http_status: httpStatus,
    address_length: addressLength,
    message: truncateForLog(safeErrorMessage(error), 300)
  });
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
