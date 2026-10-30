# Sephral’s Saved Encounters: Manual

Saved Encounters is a tool for the GM. Players never see its windows, its encounters or its map pins.

## Saving an encounter

1. Put the monsters on a map the way they should stand and select them (drag a box or Shift and click).
2. Click *Save selected tokens as an encounter* in the token controls on the left, or *Save selected tokens* in the encounters window.
3. In the window that opens:
   * **Name** and **Folder.** Encounters live in the journal folder *Encounters*. Choose one of its subfolders or *New folder…* to make one.
   * **Monsters.** One line per actor with the number of saved tokens. In *How many* you can type a number or a dice formula such as `1d4+1`. It is rolled every time you place the encounter. Empty places the tokens as saved. Unique characters (tokens linked to their actor, like a named villain) get no count: they are placed once, see [Unique characters](#unique-characters).
   * **Drop actors** from the actor sidebar or a compendium onto the monster list to add them. They join their group or start a new one and take a free square next to the others.
   * **Loot.** Drop a roll table here.
   * **Notes** for yourself: tactics, treasure, what happens when the fight turns.
   * **Keep the changes on these tokens** only appears when some selected tokens were changed in play, for example lost hit points. Without the tick every placement starts with fresh monsters. The contents of an Item Piles chest are such changes too: tick the box to place the chest with its treasure.
4. *Save.*

What is kept per token: its formation in grid squares, name, picture, size, facing, hidden state, disposition, elevation, vision and light, and everything else on the token except its position and the scene. Token Attacher's list of the tiles and walls attached on the old map is left out, since those belong to that map. Encounters made on a map with 100 pixel squares fit a map with 140 pixel squares the same way.

## The encounters window

Open it with *Saved encounters* in the token controls, the button *Saved Encounters* above the journal sidebar, a key you choose in Foundry's key settings or the settings of the module. It lists every encounter of the world by folder, with a search field on top.

| Button | Does |
| --- | --- |
| **Place** | The monsters follow the mouse over the map. A click sets them down, snapped to the grid. Q and E turn the group (see [Turning the group](#turning-the-group)), hold Shift for no snapping, right click or Esc to cancel. The window gets out of the way while you place. |
| **Place and fight** | The same, then the monsters join the fight on this scene (a new one when there is none) and roll initiative. With *The heroes join the fight* the visible tokens of the player characters on the scene join as well and roll themselves. Group, party and loot actors and Item Piles piles are placed but stay out of the fight. If the system cannot roll initiative, the monsters still join and a warning says so. A unique character that already stands on the scene is not placed again and does not join the fight. |
| Pin | Puts a pin for the encounter on the map where you click. |
| At the pin | Places the encounter around its pin on the viewed scene, without asking for the spot. |
| Place again | Removes the monsters of the last placement and sets the encounter up fresh at the same spot with the same counts and facing. Handy when a fight should start over. |
| Remove | Takes the monsters of the last placement off the map. |
| Turn left, turn right | Turn the group 90° for the next placement and the pin, without placing it. |
| Loot | Rolls the loot table of the encounter. With Sephral’s Loot Ledger active it opens the Loot Ledger's preview, so the loot goes straight into the party's loot table. Without it the table is drawn into the chat. |
| Edit, open, delete | Edit opens the window from saving. Open shows the journal entry. Delete removes the encounter and its pins, monsters already on a map stay. |

Two switches on top: *Place hidden* places every monster hidden from the players, *The heroes join the fight* is described above. Both are also in the module settings.

Counts are rolled when you click *Place* (before you choose the spot), so the preview shows how many monsters come. Extra monsters beyond the saved ones look like the first saved token of their kind and take the nearest free squares.

The group always stays inside the scene: placed at an edge, it moves in until every monster stands on the map. On a square grid the formation moves as one and keeps its shape. On hex grids, and for encounters saved on a hex or gridless map, every monster snaps to its own cell, and one whose cell is taken moves to the nearest free one.

On Foundry 14 the monsters are placed on the level you look at, at the same height above its floor as when you saved them.

## Turning the group

While the monsters follow the mouse, **Q** turns the whole group 90° to the left and **E** 90° to the right, around the middle of the group. Ctrl or Shift and the mouse wheel turn it too, the plain wheel still zooms. The preview shows the new formation at once, and the hint at the bottom names the keys. Other keys can be set in Foundry's key settings under Saved Encounters. Outside of placing, Q and E keep doing what Foundry does with them.

* Only the positions turn. Each token keeps its picture, its facing and its size, so portrait tokens stay upright. A token wider than tall, like a 2x1 cart, keeps its width and takes the nearest free cells.
* On a square grid the turned group keeps its shape in whole squares. A quarter turn does not line up with hexes, so on a hex grid every monster takes the hex nearest to its turned spot, and one whose hex is taken moves to the nearest free one. On a gridless scene the group turns as it is.
* The encounter remembers the facing it was placed with last. The next preview starts with it, and placing at the pin, Alt and a double click on the pin and `api.place` with a spot use it too. The two arrows in the encounters window turn the remembered facing without placing, and a note under the encounter says how far it is turned. *Place again* uses the facing of the last placement.
* An encounter in a compendium turns in the preview but does not remember its facing.

## Unique characters

A token linked to its actor is a unique character, like a named villain or an NPC the party knows. All its tokens share the one actor, so a second token would share the hit points of the first. Saved Encounters places a unique character at most once per scene:

* A count never adds a second token of it.
* When it already stands on the scene, placed earlier or put there by hand, it is left out and a notice names it. Unlinked monsters are placed as often as the encounter says.
* *Place again* takes the monsters of the last placement off the map first, so a unique character from that placement comes back.
* *Place and fight* leaves a unique character that already stands on the scene where it is and does not add it to the fight. The notice says so. Add its token to the fight by hand if it joins in.

This holds for every way of placing: the buttons, the journal menu, at the pin, Alt and double click on a pin, and `api.place`. Tokens of the same actor that are not linked to it do not count.

## Monsters from compendiums

Tokens on a map always belong to an actor in the world. Saved Encounters remembers that actor and, when it came from a compendium, that compendium actor too. When you place an encounter:

1. The world actor is used when it still exists.
2. Otherwise an actor imported earlier from the same compendium actor is used, if it still has that monster's name. Homebrew variants you made from it (a *Skeletal Archer* from the *Skeleton*) carry the same source and are left alone.
3. Otherwise the compendium actor is imported once into the actor folder *Encounter monsters* and used from then on.
4. As a last resort, for encounters brought from another world, an actor with the same name and type.

Actors that cannot be found are named in a warning and left out.

## Map pins

A pin marks where an encounter waits. Only you see it: players never see pins of journal entries they cannot open. Pins show on the map when the journal notes are visible (the notes layer or Foundry's *Toggle Journal Notes*).

* Double click a pin: the encounter's journal entry opens. Its menu (the three dots in the title bar) now has *Place at the pin on this scene*.
* Alt and a double click on a pin: the encounter is placed around the pin at once.

The setting *Name on the map pin* writes the encounter's name below the pin.

## The journal entry

Each encounter is a journal entry that only GMs can see. Its first page lists the monsters, the counts, the loot table and the notes, and is written again whenever you save the encounter. You can add your own pages, they stay as they are. The menu of the journal entry (three dots in the title bar) offers place, place and fight, place at the pin, pin, place again and edit.

Because encounters are journal entries, you can move them into a journal compendium and use them in another world, or ship them in an adventure. An encounter opened from a compendium can be placed directly from its journal menu. To pin or edit it, import it into the world first.

## Settings

| Setting | Scope | Does |
| --- | --- | --- |
| Module language | This device | Like Foundry, English or German |
| Look | This device | Signature (warm paper) or Foundry (dark) for the windows |
| Place hidden | This device | Placed monsters start hidden |
| The heroes join the fight | This device | Place and fight adds the visible player character tokens |
| Name on the map pin | World | The pin shows the encounter's name |
| Open encounters | GM | Opens the encounters window |
| Run self test | GM | See below |
| Save debug file | GM | See below |

## Keys

Two keys have no default, set them in Foundry's key settings under Saved Encounters: *Save the selected tokens as an encounter* and *Open the saved encounters*. *Turn the group left while placing* (Q) and *Turn the group right while placing* (E) only act while a group follows the mouse, see [Turning the group](#turning-the-group).

## Self test

*Run self test* in the module settings checks what placing needs in Foundry: grid snapping, the conversion between screen and map, initiative, compendium import, dialogs, drag and drop, the storage, every saved encounter, and a test placement on the viewed scene. The result comes as a notification and a chat message only you see, with the Foundry version the module was verified with. After a Foundry update you get a one time notice to run it.

## Debug file

For bug reports, the GM saves one file about all of Sephral’s modules in this world: `Save debug file` in the module settings, or `Save Debug File (Sephral’s Modules)` in the context menu of a chat message. It holds the versions of Foundry, the system and the active modules, the settings of the modules and what they recorded, for Saved Encounters the number of encounters with their groups and counts, the last placements, the number of pins, the viewed scene and its grid, and the recent saves, placements, fights and pins. Notes and token data are left out. Macros call `game.modules.get("sephrals-saved-encounters").api.saveDebugFile()`.

The file contains chat text and whispers. Check it before you share it.

## Storage

* Every encounter is a journal entry in the folder *Encounters*, visible to GMs only. Back up the world, or put the entries into a compendium, to keep them.
* Monsters imported from compendiums land in the actor folder *Encounter monsters*.
* The last placement of each encounter (scene, spot, tokens, counts and facing) is kept in a hidden world setting, so *Place again* and *Remove* work after a reload.
* The remembered facing of an encounter is the flag `turns` on its journal entry: quarter turns to the right, 0 to 3.
* Map pins are journal notes on their scene.

## Macro API

`game.modules.get("sephrals-saved-encounters").api` offers:

| Function | What it does |
| --- | --- |
| `open()` | Opens the encounters window (GM) |
| `saveSelected()` | Opens the save window for the selected tokens (GM) |
| `edit(entry)` | Opens the save window of an encounter |
| `encounters()` | All encounters of the world (journal entries) |
| `encounterOf(entry)` | The monsters, counts and notes of an encounter, or `null` |
| `place(entry, options)` | Places an encounter (the journal entry or its UUID). Options: `combat`, `center: {x, y}` to place there without asking, `scene`, `counts`, `hidden`, `turns` (quarter turns to the right, negative to the left, the remembered facing when left out). Returns the created tokens. Unique characters already on the scene are left out |
| `facing(entry)` | The remembered facing of an encounter: quarter turns to the right, 0 to 3 |
| `turn(entry, delta)` | Turns the remembered facing by quarter turns (1 right, -1 left) and returns the new facing |
| `turnPreview(delta)` | Turns the group that follows the mouse right now. `false` when none does |
| `placeAtPin(entry)` | Places an encounter at its pin on the viewed scene |
| `placePin(entry)` | Puts a pin on the map where the GM clicks |
| `removePlaced(entry)` | Removes the tokens of the last placement |
| `placeAgain(entry)` | Removes them and places the encounter again at the same spot |
| `lastPlacement(uuid)` | The scene, spot, tokens and counts of the last placement, or `null` |
| `rollLoot(entry)` | Rolls the loot table of an encounter |
| `cancel()` | Stops a running placement |
| `runSelfTest()` | Runs the self test (GM) |
| `saveDebugFile()` | Saves the debug file (GM) |

## Usage statistics

The module can take part in a small usage report shared by all of Sephral’s modules. Nothing is counted or sent until the GM agrees: shortly after the world starts, the active GM is asked, and the question comes back at every start until there is an answer. The answer counts for all of Sephral’s modules in the world. *Share usage statistics* in the module settings turns the report on or off at any time, and *Manage statistics* below it shows what the report contains right now.

With the GM’s consent only the active GM’s browser counts, and it sends at most one report a day. The counts are kept in a hidden world setting, so all browsers and computers of the GM count together, and turning the statistics off deletes them. A copy of a world gets its own world ID. The question lists everything the report contains, from the Foundry version to a random world ID. For Saved Encounters it holds:

* on how many of the last 30 days the module was used
* how often the GM saves an encounter, places one, places and fights, sets a pin, places at a pin, places again, removes placed monsters, drops actors into an encounter and rolls loot
* the settings *Look*, *Place hidden*, *The heroes join the fight* and *Name on the map pin* (only the chosen option)
* where errors occur in the module code: file, line and error type, never the error message

No names, notes, pictures or other content of the world are sent.
