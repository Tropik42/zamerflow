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
      const timeout = setTimeout(() => {
        controller.abort();
      }, params.timeoutMs);

      try {
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

        if (!response.ok) {
          throw new DadataHttpError(response.status);
        }

        const data = (await response.json()) as unknown;

        if (!Array.isArray(data)) {
          return undefined;
        }

        const first = data[0];
        if (!first || typeof first !== "object") {
          return undefined;
        }

        return first as DadataCleanAddressResult;
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}
