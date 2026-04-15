interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
}

/**
 * NOAA Weather MCP — National Weather Service forecasts and alerts
 *
 * Tools:
 * - get_forecast: Get a multi-day weather forecast for a lat/lon location
 * - get_alerts: Get active weather alerts for a US state
 * - get_stations: List weather observation stations for a US state
 */


const BASE = 'https://api.weather.gov';
const USER_AGENT = 'pipeworx-mcp/1.0 (https://pipeworx.io)';

const tools: McpToolExport['tools'] = [
  {
    name: 'get_forecast',
    description:
      'Get a multi-day weather forecast for a latitude/longitude location using the National Weather Service.',
    inputSchema: {
      type: 'object',
      properties: {
        lat: {
          type: 'number',
          description: 'Latitude of the location (e.g. 37.7749)',
        },
        lon: {
          type: 'number',
          description: 'Longitude of the location (e.g. -122.4194)',
        },
      },
      required: ['lat', 'lon'],
    },
  },
  {
    name: 'get_alerts',
    description:
      'Get currently active weather alerts for a US state (e.g. CA, NY, TX).',
    inputSchema: {
      type: 'object',
      properties: {
        state: {
          type: 'string',
          description: 'Two-letter US state code (e.g. "CA", "NY")',
        },
      },
      required: ['state'],
    },
  },
  {
    name: 'get_stations',
    description: 'List weather observation stations for a US state.',
    inputSchema: {
      type: 'object',
      properties: {
        state: {
          type: 'string',
          description: 'Two-letter US state code (e.g. "CA", "NY")',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of stations to return (default: 20)',
        },
      },
      required: ['state'],
    },
  },
];

interface NwsPointsResponse {
  properties: {
    forecast: string;
    forecastHourly: string;
    relativeLocation?: {
      properties?: {
        city?: string;
        state?: string;
      };
    };
  };
}

interface NwsForecastPeriod {
  name: string;
  startTime: string;
  endTime: string;
  isDaytime: boolean;
  temperature: number;
  temperatureUnit: string;
  windSpeed: string;
  windDirection: string;
  shortForecast: string;
  detailedForecast: string;
}

interface NwsForecastResponse {
  properties: {
    periods: NwsForecastPeriod[];
  };
}

interface NwsAlertFeature {
  properties: {
    id: string;
    event: string;
    headline?: string;
    description?: string;
    severity: string;
    urgency: string;
    certainty: string;
    effective: string;
    expires: string;
    areaDesc?: string;
  };
}

interface NwsAlertsResponse {
  features: NwsAlertFeature[];
}

interface NwsStationFeature {
  properties: {
    stationIdentifier: string;
    name: string;
    timeZone?: string;
  };
  geometry?: {
    coordinates?: [number, number];
  };
}

interface NwsStationsResponse {
  features: NwsStationFeature[];
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const headers = { 'User-Agent': USER_AGENT, Accept: 'application/geo+json' };

  switch (name) {
    case 'get_forecast': {
      const lat = args.lat as number;
      const lon = args.lon as number;

      // Step 1: resolve the grid point
      const pointRes = await fetch(`${BASE}/points/${lat},${lon}`, { headers });
      if (!pointRes.ok) {
        throw new Error(`NWS points lookup failed: ${pointRes.status} — coordinates may be outside the US`);
      }
      const pointData = (await pointRes.json()) as NwsPointsResponse;
      const forecastUrl = pointData.properties.forecast;
      const location = pointData.properties.relativeLocation?.properties;

      // Step 2: fetch the forecast
      const forecastRes = await fetch(forecastUrl, { headers });
      if (!forecastRes.ok) throw new Error(`NWS forecast fetch failed: ${forecastRes.status}`);
      const forecastData = (await forecastRes.json()) as NwsForecastResponse;

      return {
        location: {
          lat,
          lon,
          city: location?.city ?? null,
          state: location?.state ?? null,
        },
        periods: forecastData.properties.periods.map((p) => ({
          name: p.name,
          start_time: p.startTime,
          end_time: p.endTime,
          is_daytime: p.isDaytime,
          temperature: p.temperature,
          temperature_unit: p.temperatureUnit,
          wind_speed: p.windSpeed,
          wind_direction: p.windDirection,
          short_forecast: p.shortForecast,
          detailed_forecast: p.detailedForecast,
        })),
      };
    }

    case 'get_alerts': {
      const state = (args.state as string).toUpperCase();

      const params = new URLSearchParams({ area: state });
      const res = await fetch(`${BASE}/alerts/active?${params}`, { headers });
      if (!res.ok) throw new Error(`NWS alerts error: ${res.status}`);

      const data = (await res.json()) as NwsAlertsResponse;

      return {
        state,
        count: data.features.length,
        alerts: data.features.map((f) => ({
          id: f.properties.id,
          event: f.properties.event,
          headline: f.properties.headline ?? null,
          severity: f.properties.severity,
          urgency: f.properties.urgency,
          certainty: f.properties.certainty,
          effective: f.properties.effective,
          expires: f.properties.expires,
          area: f.properties.areaDesc ?? null,
          description: f.properties.description ?? null,
        })),
      };
    }

    case 'get_stations': {
      const state = (args.state as string).toUpperCase();
      const limit = Math.max(1, Math.min(500, (args.limit as number) ?? 20));

      const params = new URLSearchParams({ state, limit: String(limit) });
      const res = await fetch(`${BASE}/stations?${params}`, { headers });
      if (!res.ok) throw new Error(`NWS stations error: ${res.status}`);

      const data = (await res.json()) as NwsStationsResponse;

      return {
        state,
        count: data.features.length,
        stations: data.features.map((f) => ({
          id: f.properties.stationIdentifier,
          name: f.properties.name,
          time_zone: f.properties.timeZone ?? null,
          coordinates: f.geometry?.coordinates
            ? { lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }
            : null,
        })),
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default { tools, callTool } satisfies McpToolExport;
