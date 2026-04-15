# mcp-noaa

NOAA Weather MCP — National Weather Service forecasts and alerts

Part of the [Pipeworx](https://pipeworx.io) open MCP gateway.

## Tools

| Tool | Description |
|------|-------------|
| `get_stations` | List weather observation stations for a US state. |

## Quick Start

Add to your MCP client config:

```json
{
  "mcpServers": {
    "noaa": {
      "url": "https://gateway.pipeworx.io/noaa/mcp"
    }
  }
}
```

Or use the CLI:

```bash
npx pipeworx use noaa
```

## License

MIT
