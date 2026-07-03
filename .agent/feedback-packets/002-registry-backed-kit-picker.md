# Registry Backed Kit Picker Feedback

Status: active

## User Correction

- Adding kits was wrong because `+ Kit` blindly appended a hardcoded row.
- The editor needs to look through NexusRealtime/ProtoKits-style kit registry and installer concepts.
- Users should select kits from a dropdown, with sub-kits/domains visible before installation.

## Design Consequence

- Domain Stack owns kit install intent, not arbitrary row creation.
- The Add Kit flow must expose registry search/category/dropdown selection.
- The selected kit detail should expose dependencies and child/sub-kits.
- Install should write registry metadata into the project/export manifest.
