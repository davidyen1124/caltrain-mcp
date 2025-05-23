# 🚂 Caltrain MCP Server (Because You Love Waiting for Trains)

![Caltrain MCP Demo](assets/caltrain-mcp-demo.png)

A Model Context Protocol (MCP) server that promises to tell you _exactly_ when the next Caltrain will arrive... and then be 10 minutes late anyway. Uses real GTFS data, so at least the disappointment is official!

## Features (Or: "Why We Built This Thing")

- 🚆 **"Real-time" train schedules** - Get the next departures between any two stations (actual arrival times may vary by +/- infinity)
- 📍 **Station lookup** - Because apparently 31 stations is too many to memorize 🤷‍♀️
- 🕐 **Time-specific queries** - Plan your commute with surgical precision, then watch it all fall apart
- ✨ **Smart search** - Type 'sf' instead of the full name because we're all lazy here
- 📊 **GTFS-based** - We use the same data Caltrain does, so when things go wrong, we can blame them together

## Setup (The Fun Part 🙄)

1. **Install dependencies** (aka "More stuff to break"):

   ```bash
   # Install uv if you haven't already (because pip is apparently too mainstream now)
   curl -LsSf https://astral.sh/uv/install.sh | sh

   # Install dependencies using uv (fingers crossed it actually works)
   uv sync
   ```

2. **Get that sweet, sweet GTFS data**:
   The server expects Caltrain GTFS data in the `data/caltrain-ca-us/` directory. Because apparently we can't just ask the trains nicely where they are.

   ```bash
   uv run python scripts/fetch_gtfs.py
   ```

   This magical script downloads files that contain:

   - `stops.txt` - All the places trains pretend to stop
   - `trips.txt` - Theoretical journeys through space and time
   - `stop_times.txt` - When trains are _supposed_ to arrive (spoiler: they don't)
   - `calendar.txt` - Weekday vs weekend schedules (because trains also need work-life balance)

## Usage (Good Luck!)

### As an MCP Server (The Real Deal)

This server is designed to be used with MCP clients like Claude Desktop, not run directly by humans (because that would be too easy). Here's how to actually use it:

#### With Claude Desktop

Add this to your Claude Desktop MCP configuration file:

```json
{
  "mcpServers": {
    "caltrain": {
      "command": "uv",
      "args": ["run", "caltrain-mcp"],
      "cwd": "/path/to/your/caltrain-mcp"
    }
  }
}
```

Then restart Claude Desktop and you'll have access to Caltrain schedules directly in your conversations!

#### With Other MCP Clients

Any MCP-compatible client can use this server by starting it with:

```bash
uv run caltrain-mcp
```

The server communicates via stdin/stdout using the MCP protocol. It doesn't do anything exciting when run directly - it just sits there waiting for proper MCP messages.

### Testing the Server (For Development)

You can test if this thing actually works by importing it directly:

```python
from caltrain_mcp.server import next_trains, list_stations

# Test next trains functionality (prepare for disappointment)
result = await next_trains('San Jose Diridon', 'San Francisco')
print(result)  # Spoiler: there are no trains

# Test stations list (all 31 of them, because apparently that's manageable)
stations = await list_stations()
print(stations)
```

## Available Tools (Your New Best Friends)

### `next_trains(origin, destination, when_iso=None)`

Ask politely when the next train will show up. The server will consult its crystal ball (GTFS data) and give you times that are _technically_ accurate.

**Parameters:**

- `origin` (str): Where you are now (probably regretting your life choices)
- `destination` (str): Where you want to be (probably anywhere but here)
- `when_iso` (str, optional): When you want to travel (as if time has any meaning in public transit)

**Examples:**

```python
# Next trains from current time (aka "right now would be nice")
next_trains('San Jose Diridon', 'San Francisco')

# Trains at a specific time (for the optimists who think schedules matter)
next_trains('Palo Alto', 'sf', '2025-05-23T06:00:00')

# Using abbreviations (because typing is hard)
next_trains('diridon', 'sf')
```

### `list_stations()`

Get a list of all 31 Caltrain stations, because memorizing them is apparently too much to ask.

**Returns:**
A formatted list that will make you realize just how many places this train supposedly goes.

## Station Name Recognition (We're Not Mind Readers, But We Try)

The server supports various ways to be lazy about typing station names:

- **Full names**: "San Jose Diridon Station" (for the perfectionists)
- **Short names**: "San Francisco" (for the slightly less perfectionist)
- **Abbreviations**: "sf" → "San Francisco" (for the truly lazy)
- **Partial matching**: "diridon" matches "San Jose Diridon Station" (for when you can't be bothered)

## Available Stations (All 31 Glorious Stops)

The server covers every single Caltrain station because we're completionists:

**San Francisco to San Jose** (The Main Event):

- San Francisco, 22nd Street, Bayshore, South San Francisco, San Bruno, Millbrae, Broadway, Burlingame, San Mateo, Hayward Park, Hillsdale, Belmont, San Carlos, Redwood City, Menlo Park, Palo Alto, Stanford, California Avenue, San Antonio, Mountain View, Sunnyvale, Lawrence, Santa Clara, College Park, San Jose Diridon

**San Jose to Gilroy** (The "Why Does This Exist?" Extension):

- Tamien, Capitol, Blossom Hill, Morgan Hill, San Martin, Gilroy

## Sample Output (Prepare to Be Amazed)

```
🚆 Next Caltrain departures from San Jose Diridon Station to San Francisco Caltrain Station on Thursday, May 22, 2025:
• Train 153: 17:58:00 → 19:16:00 (to San Francisco)
• Train 527: 18:22:00 → 19:22:00 (to San Francisco)
• Train 155: 18:28:00 → 19:46:00 (to San Francisco)
• Train 429: 18:43:00 → 19:53:00 (to San Francisco)
• Train 157: 18:58:00 → 20:16:00 (to San Francisco)
```

_Actual arrival times may vary. Side effects may include existential dread and a deep appreciation for remote work._

## Technical Details (For the Nerds)

- **GTFS Processing**: We automatically handle the relationship between stations and their platforms (because apparently trains are complicated)
- **Service Calendar**: Respects weekday/weekend schedules (trains also need their beauty rest)
- **Data Types**: Handles the chaos that is mixed integer/string formats in GTFS files
- **Time Parsing**: Supports 24+ hour format for those mythical late-night services
- **Error Handling**: Gracefully fails when you type "Narnia" as a station name

## Project Structure (The Organized Chaos)

```
caltrain-mcp/
├── .github/workflows/         # GitHub Actions (the CI/CD overlords)
│   ├── ci.yml                 # Main CI pipeline (linting, testing, the works)
│   └── update-gtfs.yml        # Automated GTFS data updates
├── src/caltrain_mcp/          # Main package (because modern Python demands structure)
│   ├── __init__.py            # Package initialization (the ceremony of Python)
│   ├── __main__.py            # Entry point for python -m caltrain_mcp
│   ├── server.py              # MCP server implementation (where the magic happens)
│   └── gtfs.py                # GTFS data processing (aka "CSV wrestling")
├── scripts/                   # Utility scripts (the supporting cast)
│   ├── __init__.py            # Makes scripts a proper Python package
│   ├── fetch_gtfs.py          # Downloads the latest disappointment data
│   └── lint.py                # Run all CI checks locally (before embarrassment)
├── tests/                     # Test suite (because trust but verify)
│   ├── conftest.py            # Shared test fixtures (the common ground)
│   ├── test_gtfs.py           # GTFS functionality tests (8 tests of data wrangling)
│   ├── test_server.py         # Server functionality tests (4 tests of MCP protocol)
│   └── test_fetch_gtfs.py     # Data fetching tests (7 tests of download chaos)
├── data/                      # GTFS data storage (where CSV files go to retire)
├── .pre-commit-config.yaml    # Pre-commit hooks configuration
├── pyproject.toml             # Modern Python config (because setup.py is so 2020)
└── README.md                  # This literary masterpiece
```

## Development & Testing (For When Things Inevitably Break)

### Code Quality & CI/CD

This project uses modern Python tooling to keep the code clean and maintainable:

- **Ruff**: Lightning-fast linting and formatting (because life's too short for slow tools)
- **MyPy**: Type checking (because guessing types is for amateurs)
- **Pytest**: Testing framework with coverage reporting
- **Pre-commit**: Automatic checks before committing (preventing embarrassment since forever)

#### Running All Checks Locally

Before pushing your masterpiece to GitHub:

```bash
# Run all checks at once (the full gauntlet)
uv run python scripts/lint.py

# Or use the installed script
uv run caltrain-lint

# Individual commands if you like to suffer step by step:
uv run ruff check .              # Linting
uv run ruff format --check .     # Formatting check
uv run mypy src tests           # Type checking
uv run pytest --cov=src/caltrain_mcp --cov-report=term-missing  # Tests with coverage
```

#### Setting Up Pre-commit Hooks

To automatically run checks before every commit (because we all forget):

```bash
# Install pre-commit hooks
uv run pre-commit install

# Test the hooks
uv run pre-commit run --all-files
```

#### GitHub Actions CI

Every PR and push to main triggers automatic checks:

- ✅ **Linting**: Ruff checks for code quality issues
- ✅ **Formatting**: Ensures consistent code style
- ✅ **Type Checking**: MyPy validates type annotations
- ✅ **Tests**: Full test suite with coverage reporting
- ✅ **Coverage**: Automatic upload to Codecov

The CI will politely reject your PR if any checks fail, because standards matter.

### Running Tests

Because we're responsible developers who definitely don't just ship to production:

```bash
# Run all tests (the full experience)
uv run pytest

# Run specific test modules (because sometimes you just want to focus)
uv run pytest tests/test_gtfs.py      # Test GTFS data processing
uv run pytest tests/test_server.py    # Test MCP server functionality
uv run pytest tests/test_fetch_gtfs.py # Test data fetching

# Run with verbose output (for when you need to see everything fail in detail)
uv run pytest -v
```

### Test Coverage

Our test suite includes:

- **GTFS module tests** (8 tests): Station lookups, time parsing, service calendars
- **Server tests** (4 tests): MCP protocol handling, error cases, timezone handling
- **Data fetching tests** (7 tests): Download handling, ZIP extraction, error cases

## MCP Integration (For the AI Overlords)

This server implements the Model Context Protocol (MCP), which means it's designed to work seamlessly with AI assistants and other MCP clients. Once configured:

- **Claude Desktop**: Ask Claude about train schedules directly in conversation
- **Other MCP Clients**: Any MCP-compatible tool can access Caltrain data
- **Real-time Integration**: Your AI can check schedules, suggest routes, and help plan trips
- **Natural Language**: No need to remember station names or command syntax

The server exposes two main tools:

- `next_trains` - Get upcoming departures between stations
- `list_stations` - Browse all available Caltrain stations

So your AI assistant can now disappoint you about train schedules just like a real human would! The future is truly here.

## License (The Legal Stuff)

This project uses official Caltrain GTFS data. If something goes wrong, blame them, not us. We're just the messenger.

---

_Built with ❤️ and a concerning amount of caffeine in the Bay Area, where public transit is both a necessity and a source of eternal suffering._
