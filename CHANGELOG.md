# CHANGELOG


## v0.8.7 (2026-03-29)

### Bug Fixes

- Unblock GTFS refresh workflow ([#26](https://github.com/davidyen1124/caltrain-mcp/pull/26),
  [`1993662`](https://github.com/davidyen1124/caltrain-mcp/commit/199366246aa54f38e806ba768c9eb1a69736edb2))


## v0.8.6 (2025-09-12)

### Bug Fixes

- Prefer exact station matches in lookup
  ([#21](https://github.com/davidyen1124/caltrain-mcp/pull/21),
  [`463f35c`](https://github.com/davidyen1124/caltrain-mcp/commit/463f35ce309a385ba51ce68ba63e72d6ead5b33b))

* fix: prefer exact station matches in lookup

Prioritize exact normalized name equality, then prefix matches, then substring. Prevents 'San
  Francisco' resolving to 'South San Francisco' due to substring match.

Verified via MCP Inspector: - tools/list OK - list_stations OK (GTFS loads) - next_trains OK for
  'San Jose Diridon' -> 'San Francisco'

No API changes; pure internal matching logic tweak.

* chore: remove local MCP Inspector config from repo

* test: add station matching cases for exact vs prefix vs substring and SSF abbreviation


## v0.8.5 (2025-09-12)

### Chores

- Refresh GTFS feed
  ([`db262ab`](https://github.com/davidyen1124/caltrain-mcp/commit/db262ab8e71a83b12472af7a0dd69b494d280767))

Co-authored-by: caltrain-bot <caltrain-bot@users.noreply.github.com>


## v0.8.4 (2025-06-30)

### Chores

- Refresh GTFS feed
  ([`9ca1bbb`](https://github.com/davidyen1124/caltrain-mcp/commit/9ca1bbbc1d6e52495c1ec7e7523e76a422b491d5))

### Refactoring

- Replace global GTFS state with data object
  ([`a7bf292`](https://github.com/davidyen1124/caltrain-mcp/commit/a7bf29245badc79ffbaa551bdbfd5764603ca011))


## v0.8.3 (2025-06-15)

### Performance Improvements

- Cache platform stops mapping
  ([`fa83cf4`](https://github.com/davidyen1124/caltrain-mcp/commit/fa83cf44359ea69e5b69d9a8a40273338c1e6d67))


## v0.8.2 (2025-06-15)

### Chores

- Drop requests dependency
  ([`7aca9c0`](https://github.com/davidyen1124/caltrain-mcp/commit/7aca9c009cf3016efb491867f9c83a437824f058))


## v0.8.1 (2025-06-14)

### Documentation

- Add Cursor badge
  ([`17f55e9`](https://github.com/davidyen1124/caltrain-mcp/commit/17f55e990daa50bdbd8b8de8f70e5872f3fe8534))


## v0.8.0 (2025-05-24)

### Features

- Add git configuration step for semantic release
  ([`56d29e2`](https://github.com/davidyen1124/caltrain-mcp/commit/56d29e26b418189f6cbe93d71a0df4625830e9f4))

- Enable tag without push for semantic release
  ([`32470e1`](https://github.com/davidyen1124/caltrain-mcp/commit/32470e14523d53a9d48b149d20e3c613a7716027))


## v0.7.1 (2025-05-24)

### Chores

- Remove outdated deployment checklist and related documentation from README
  ([`69dec97`](https://github.com/davidyen1124/caltrain-mcp/commit/69dec979cf9b4aadff019dc631eaf1c385568b6d))

### Documentation

- Update README with new command and args for Caltrain MCP configuration
  ([`f086fbe`](https://github.com/davidyen1124/caltrain-mcp/commit/f086fbed5d2ad6b021789e9da8c1ec01889bddeb))


## v0.7.0 (2025-05-24)

### Features

- Enable PyPI publishing for automated releases
  ([`5cbaf29`](https://github.com/davidyen1124/caltrain-mcp/commit/5cbaf29ef9016f3127b4ca0843ff90959b2190f3))

### Refactoring

- Reorganize GTFS data structure and update paths in configuration and scripts
  ([`f5e792c`](https://github.com/davidyen1124/caltrain-mcp/commit/f5e792ca80429fedd1fd29a4d83ca2b576bed32f))


## v0.6.1 (2025-05-24)

### Bug Fixes

- Redirect logging to stderr to prevent MCP protocol interference
  ([`b42c1ce`](https://github.com/davidyen1124/caltrain-mcp/commit/b42c1ce5021fc28ad424024ffeae5c12ada39d74))


## v0.6.0 (2025-05-24)

### Features

- Include data files in wheel and sdist build targets
  ([`9fad56e`](https://github.com/davidyen1124/caltrain-mcp/commit/9fad56e57c300b9418f29f60ac871a8180a53d43))


## v0.5.0 (2025-05-24)

### Chores

- Update CI workflow to use environment variable for Python version for improved flexibility
  ([`fd917d1`](https://github.com/davidyen1124/caltrain-mcp/commit/fd917d19725bb3be7683c80e664674f5138c21a4))

### Features

- Enhance CI workflow by introducing environment variable for Python version and adding steps for
  building from tagged releases
  ([`938e6f4`](https://github.com/davidyen1124/caltrain-mcp/commit/938e6f495b1cfc922cc1d1570021bf946f528cc0))


## v0.4.0 (2025-05-24)

### Features

- Add build step to CI workflow for package preparation before publishing to PyPI
  ([`62e9b6c`](https://github.com/davidyen1124/caltrain-mcp/commit/62e9b6c4a48a9495079306405fde9445c9a3eff5))


## v0.3.0 (2025-05-24)

### Chores

- Remove environment specification from CI workflow to simplify configuration
  ([`1151fe9`](https://github.com/davidyen1124/caltrain-mcp/commit/1151fe912ab3a80cb8459755fc031ea9e0162f9c))

### Features

- Update CI workflow for clearer separation of testing and release steps, and clean up
  pyproject.toml by removing unnecessary dependencies
  ([`65fe8b8`](https://github.com/davidyen1124/caltrain-mcp/commit/65fe8b856730239d3a38115b04e5b8bd56ac0374))


## v0.2.3 (2025-05-24)

### Bug Fixes

- Add fallback version to pyproject.toml and enhance CI workflow for building from clean tags
  ([`d90e701`](https://github.com/davidyen1124/caltrain-mcp/commit/d90e701041f44f804d302452342547c9c221f61d))


## v0.2.2 (2025-05-24)

### Bug Fixes

- Install build dependencies globally for semantic-release Docker container
  ([`2a9470d`](https://github.com/davidyen1124/caltrain-mcp/commit/2a9470dd3bf0407e8e326d950d99f78433ff6969))

- Remove build command from pyproject.toml to streamline semantic-release process
  ([`e18e042`](https://github.com/davidyen1124/caltrain-mcp/commit/e18e042b0e23325bfc11c2e72ba06054a82dbdd8))

- Remove build from semantic-release and build from tagged commit with proper dependencies
  ([`0a96dff`](https://github.com/davidyen1124/caltrain-mcp/commit/0a96dffc191671ee35ddf59d79bf560cd4342362))


## v0.2.1 (2025-05-24)

### Bug Fixes

- Move build step after semantic-release to ensure proper version tagging
  ([`9b8196f`](https://github.com/davidyen1124/caltrain-mcp/commit/9b8196f77e7984e5659733c9eab72616d1696994))


## v0.2.0 (2025-05-24)

### Bug Fixes

- Correct semantic-release configuration with proper tag format
  ([`647a83a`](https://github.com/davidyen1124/caltrain-mcp/commit/647a83a127147f81818036d7c05b8cc0931b891d))

- Separate build step from semantic-release to resolve Docker environment issues
  ([`5a119d0`](https://github.com/davidyen1124/caltrain-mcp/commit/5a119d0d62aaa4af68b1dbf5cf0f333e4ff3774e))

- Update semantic-release command to use python-semantic-release
  ([`500655c`](https://github.com/davidyen1124/caltrain-mcp/commit/500655cf6c6c0c2fe29edfb499dd3dc61f8ebb82))

- Update semantic-release configuration for proper GitHub Actions integration
  ([`356f59b`](https://github.com/davidyen1124/caltrain-mcp/commit/356f59be3c180ea335920904b610673788a8aef4))

### Features

- Add automated versioning and PyPI publishing
  ([`2e5f61c`](https://github.com/davidyen1124/caltrain-mcp/commit/2e5f61c54eb8976e4d3630a476589c2c59ab32a6))

- Consolidate CI workflows and integrate semantic-release into main CI configuration
  ([`40592d0`](https://github.com/davidyen1124/caltrain-mcp/commit/40592d06fb655f0c22c701fed6f5cc642bd30e4e))


## v0.1.0 (2025-05-23)

### Bug Fixes

- Adjust departure time for trip_id 665
  ([`66d4352`](https://github.com/davidyen1124/caltrain-mcp/commit/66d43523dc245448fcc1c0c73029636ed37194fc))

### Documentation

- Update README and CI configuration
  ([`81f46c3`](https://github.com/davidyen1124/caltrain-mcp/commit/81f46c336741330a93f505a5e0fe6d9d978396d5))

### Features

- Enhance project structure and CI/CD integration
  ([`d22d134`](https://github.com/davidyen1124/caltrain-mcp/commit/d22d1346f2f77852e35dd9fc318917b3b169b13d))

- Initial Caltrain MCP Server implementation
  ([`a6749fb`](https://github.com/davidyen1124/caltrain-mcp/commit/a6749fb29f3bed183b2f590780c6ac1a24c1b91e))

- Update GTFS workflow with enhanced branch handling
  ([`817b743`](https://github.com/davidyen1124/caltrain-mcp/commit/817b743ee0bec9fc50d50f74d74e917fd8eff73c))
