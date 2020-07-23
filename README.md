# Allows manual drawing of fog of war
Lets you draw fog of war manually

# todo
- Hide token cursors under fog(?)
- Core fog sync option(?) (Clamp lighting mask?)
- ~~Brush sizes~~
- ~~Brush/tool + - & .5~~
- ~~Handle canvas resize~~
- ~~Fog Color & Opacity~~
- ~~Box Shape~~
- ~~Circle Shape~~
- ~~Poly Shape~~
- ~~Undo~~
- ~~refactor mask layer to its own class to be reusable~~
- ~~Grid snap brush~~
- ~~Hex grid snap brush~~
- ~~Optimization~~
- Allow custom default tint/opacity
- Allow revealing core dynamic fog to the "explored" state, while retaining active line of sight fog as underlay
- Allow cancel of current drawing via right click while dragging ?
- ~~Blur~~ / sepia / monochrome filters?
- Mouse cursor tool indications
- Documentation
- Shift / ctrl shape tool modifiers
- Blur filter should recalcuate pixel width to maintain consistency with zoom level
- Keybindings for changing brush size

# bugs
- error when activating scene with no player token
- sometimes hex grid tool stops drawing certain hexes
- ~~create a light, use mask brush tool, blank journal entries will be created~~

# future features
- Brush Smoothing / Interpolation
- Image based fog import