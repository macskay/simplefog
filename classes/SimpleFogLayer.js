import MaskLayer from './MaskLayer.js';
import { Layout } from '../libs/hexagons.js';
import { hexObjsToArr } from '../js/helpers.js';

const DEFAULTS = {
  gmAlpha: 0.6,
  gmTint: '0x000000',
  playerAlpha: 1,
  playerTint: '0x000000',
  transition: true,
  transitionSpeed: 800,
  previewFill: 0x00FFFF,
  handlefill: 0xff6400,
  handlesize: 20,
  previewAlpha: 0.4,
  blurQuality: 2,
  blurRadius: 5,
  brushSize: 50,
  brushOpacity: 1,
  autoVisibility: false,
  vThreshold: 1,
};

export default class SimpleFogLayer extends MaskLayer {
  constructor() {
    super('simplefog');
    // Register event listerenrs
    this._registerMouseListeners();
    this._registerKeyboardListeners();

    // React to canvas zoom
    Hooks.on('canvasPan', (canvas, dimensions) => {
    // Scale blur filter radius to account for zooming
      this.blur.blur = this.getSetting('blurRadius') * dimensions.scale;
    });

    // React to changes to current scene
    Hooks.on('updateScene', (scene, data) => { this._updateScene(scene, data); });
  }

  async fogInit() {
    await this._initFogVars();
  }

  _initFogVars() {
    // Preview brush objects
    this.boxPreview = this.brush({
      shape: 'box',
      x: 0,
      y: 0,
      fill: DEFAULTS.previewFill,
      alpha: DEFAULTS.previewAlpha,
      width: 100,
      height: 100,
      visible: false,
      zIndex: 10,
    });
    this.ellipsePreview = this.brush({
      shape: 'ellipse',
      x: 0,
      y: 0,
      fill: DEFAULTS.previewFill,
      alpha: DEFAULTS.previewAlpha,
      width: 100,
      height: 100,
      visible: false,
      zIndex: 10,
    });
    this.shapePreview = this.brush({
      shape: 'shape',
      x: 0,
      y: 0,
      vertices: [],
      fill: DEFAULTS.previewFill,
      alpha: DEFAULTS.previewAlpha,
      visible: false,
      zIndex: 10,
    });
    this.shapeHandle = this.brush({
      shape: 'box',
      x: 0,
      y: 0,
      fill: DEFAULTS.handlefill,
      width: DEFAULTS.handlesize * 2,
      height: DEFAULTS.handlesize * 2,
      alpha: DEFAULTS.previewAlpha,
      visible: false,
      zIndex: 15,
    });
    // Add preview brushes to layer
    this.addChild(this.boxPreview);
    this.addChild(this.ellipsePreview);
    this.addChild(this.shapePreview);
    this.addChild(this.shapeHandle);

    // Set default flags if they dont exist already
    Object.keys(DEFAULTS).forEach((key) => {
      // Check for existing scene specific setting
      if (this.getSetting(key) !== undefined) return;
      // Check for custom default
      const def = game.user.getFlag(this.layername, key);
      // If user has custom default, set it for scene
      if (def !== undefined) this.setSetting(key, def);
      // Otherwise fall back to module default
      else this.setSetting(key, DEFAULTS[key]);
    });
    // These two make more sense per user, so set them on the game.user object instead of scene
    if (!game.user.getFlag(this.layername, 'brushOpacity')) game.user.setFlag(this.layername, 'brushOpacity', DEFAULTS.brushOpacity);
    if (!game.user.getFlag(this.layername, 'brushSize')) game.user.setFlag(this.layername, 'brushSize', DEFAULTS.brushSize);
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * React to updates of canvas.scene flags
   */
  _updateScene(scene, data) {
    // Check if update applies to current viewed scene
    if (!scene._view) return;
    // React to visibility change
    if (hasProperty(data, `flags.${this.layername}.visible`)) {
      canvas[this.layername].visible = data.flags[this.layername].visible;
    }
    // React to composite history change
    if (hasProperty(data, `flags.${this.layername}.blurRadius`)) {
      canvas[this.layername].blur.blur = this.getSetting('blurRadius');
    }
    // React to composite history change
    if (hasProperty(data, `flags.${this.layername}.blurQuality`)) {
      canvas[this.layername].blur.quality = this.getSetting('blurQuality');
    }
    // React to composite history change
    if (hasProperty(data, `flags.${this.layername}.history`)) {
      canvas[this.layername].renderStack(data.flags[this.layername].history);
    }
    // React to autoVisibility setting changes
    if (
      hasProperty(data, `flags.${this.layername}.autoVisibility`)
      || hasProperty(data, `flags.${this.layername}.vThreshold`)
    ) {
      canvas.sight.update();
    }
    // React to alpha/tint changes
    if (!game.user.isGM && hasProperty(data, `flags.${this.layername}.playerAlpha`)) {
      canvas[this.layername].setAlpha(data.flags[this.layername].playerAlpha);
    }
    if (game.user.isGM && hasProperty(data, `flags.${this.layername}.gmAlpha`)) {
      canvas[this.layername].setAlpha(data.flags[this.layername].gmAlpha);
    }
    if (!game.user.isGM && hasProperty(data, `flags.${this.layername}.playerTint`)) canvas[this.layername].setTint(data.flags[this.layername].playerTint);
    if (game.user.isGM && hasProperty(data, `flags.${this.layername}.gmTint`)) canvas[this.layername].setTint(data.flags[this.layername].gmTint);
  }

  /**
   * Adds the mouse listeners to the layer
   */
  _registerMouseListeners() {
    this.addListener('pointerdown', this._pointerDown);
    this.addListener('pointerup', this._pointerUp);
    this.addListener('pointermove', this._pointerMove);
    this.dragging = false;
    this.brushing = false;
  }

  /**
   * Adds the keyboard listeners to the layer
   */
  _registerKeyboardListeners() {
    $(document).keydown((event) => {
      if (ui.controls.activeControl !== this.layername) return;
      if (event.which === 90 && event.ctrlKey) {
        event.stopPropagation();
        this.undo();
      }
    });
  }

  /**
   * Mouse handlers for canvas layer interactions
   */
  _pointerMove(event) {
  // Get mouse position translated to canvas coords
    const p = event.data.getLocalPosition(canvas.app.stage);
    // Brush tool
    switch (this.op) {
      case 'brushing':
        // Send brush movement events to renderbrush to be drawn and added to history stack
        this.renderBrush({
          shape: 'ellipse',
          x: p.x,
          y: p.y,
          fill: game.user.getFlag(this.layername, 'brushOpacity'),
          width: game.user.getFlag(this.layername, 'brushSize'),
          height: game.user.getFlag(this.layername, 'brushSize'),
          alpha: 1,
          visible: true,
        });
        break;
        // Drag box tool
      case 'box':
        // Just update the preview shape
        this.boxPreview.width = p.x - this.dragStart.x;
        this.boxPreview.height = p.y - this.dragStart.y;
        break;
        // Drag ellipse tool
      case 'ellipse':
        // Just update the preview shape
        this.ellipsePreview.width = (p.x - this.dragStart.x) * 2;
        this.ellipsePreview.height = (p.y - this.dragStart.y) * 2;
        break;
      case 'grid':
        // eslint-disable-next-line no-case-declarations
        const { grid } = canvas.scene.data;
        // Square grid
        if (canvas.scene.data.gridType === 1) {
          const gridx = Math.floor(p.x / grid);
          const gridy = Math.floor(p.y / grid);
          const x = gridx * grid;
          const y = gridy * grid;
          // Check if this grid was already drawn
          if (!this.dupes[gridx][gridy]) {
            // Flag cell as drawn in dupes
            this.dupes[gridx][gridy] = 1;
            this.boxPreview.x = x;
            this.boxPreview.y = y;
            this.renderBrush({
              shape: 'box',
              x,
              y,
              width: grid,
              height: grid,
              visible: true,
              fill: game.user.getFlag(this.layername, 'brushOpacity'),
              alpha: 1,
            });
          }
          // Hex Grid
        } else if ([2, 3, 4, 5].includes(canvas.scene.data.gridType)) {
          // Convert pixel coord to hex coord
          const qr = this.gridLayout.pixelToHex(p);
          const gridq = Math.ceil(qr.q - 0.5);
          const gridr = Math.ceil(qr.r - 0.5);
          // Check if this grid cell was already drawn
          if (!this.doesArrayOfArraysContainArray(this.dupes, [gridq, gridr])) {
            // Get the vert coords for the hex
            const vertices = this.gridLayout.polygonCorners({ q: gridq, r: gridr });
            // Convert to array of individual verts
            const arr = hexObjsToArr(vertices);
            this.renderBrush({
              shape: 'polygon',
              vertices: arr,
              x: 0,
              y: 0,
              visible: true,
              fill: game.user.getFlag(this.layername, 'brushOpacity'),
              alpha: 1,
            });
            // Flag cell as drawn in dupes
            this.dupes.push([gridr, gridq]);
          }
        }
        break;
      case 'shape':
        break;
      default:
        break;
    }
  }

  _pointerDown(event) {
    // Only react on left mouse button
    if (event.data.button === 0) {
      const p = event.data.getLocalPosition(canvas.app.stage);
      // Check active tool
      switch (ui.controls.controls.find((n) => n.name === this.layername).activeTool) {
      // Activate brush op
        case 'brush':
          this.op = 'brushing';
          break;
        // Activate grid op
        case 'grid':
          this.op = 'grid';
          // Get grid type & dimensions
          const { grid } = canvas.scene.data;
          const { width } = canvas.dimensions;
          const { height } = canvas.dimensions;
          // Reveal the preview shape
          this.boxPreview.visible = true;
          this.boxPreview.width = grid;
          this.boxPreview.height = grid;
          // Check grid type, create a dupe detection matrix & if hex grid init a layout
          switch (canvas.scene.data.gridType) {
          // Square grid
            case 1:
              this.dupes = new Array(Math.ceil(width / grid)).fill(0).map(() => new Array(Math.ceil(height / grid)).fill(0));
              break;
            // Pointy Hex Odd
            case 2:
              this.dupes = [];
              this.gridLayout = new Layout(Layout.pointy, { x: grid / 2, y: grid / 2 }, { x: 0, y: grid / 2 });
              break;
            // Pointy Hex Even
            case 3:
              this.dupes = [];
              this.gridLayout = new Layout(Layout.pointy, { x: grid / 2, y: grid / 2 }, { x: Math.sqrt(3) * grid / 4, y: grid / 2 });
              break;
            // Flat Hex Odd
            case 4:
              this.dupes = [];
              this.gridLayout = new Layout(Layout.flat, { x: grid / 2, y: grid / 2 }, { x: grid / 2, y: 0 });
              break;
            // Flat Hex Even
            case 5:
              this.dupes = [];
              this.gridLayout = new Layout(Layout.flat, { x: grid / 2, y: grid / 2 }, { x: grid / 2, y: Math.sqrt(3) * grid / 4 });
              break;
            default:
              break;
          }
          break;
        // Activate box op, set dragstart & make preview shape visible
        case 'box':
          this.op = 'box';
          this.dragStart.x = p.x;
          this.dragStart.y = p.y;
          this.boxPreview.visible = true;
          this.boxPreview.x = p.x;
          this.boxPreview.y = p.y;
          break;
        // Activate ellipse op, set dragstart & make preview shape visible
        case 'ellipse':
          this.op = 'ellipse';
          this.dragStart.x = p.x;
          this.dragStart.y = p.y;
          this.ellipsePreview.x = p.x;
          this.ellipsePreview.y = p.y;
          this.ellipsePreview.visible = true;
          break;
        // Draw shapes
        case 'shape':
          if (!this.shape) this.shape = [];
          const x = Math.floor(p.x);
          const y = Math.floor(p.y);
          // If this is not the first vertex...
          if (this.shape.length) {
            // Check if new point is close enough to start to close the shape
            const xo = Math.abs(this.shape[0].x - x);
            const yo = Math.abs(this.shape[0].y - y);
            if (xo < DEFAULTS.handlesize && yo < DEFAULTS.handlesize) {
              const verts = hexObjsToArr(this.shape);
              // render the new shape to history
              this.renderBrush({
                shape: 'shape',
                x: 0,
                y: 0,
                vertices: verts,
                visible: true,
                fill: game.user.getFlag(this.layername, 'brushOpacity'),
                alpha: 1,
              });
              // Reset the preview shape
              this.shapePreview.clear();
              this.shapePreview.visible = false;
              this.shapeHandle.visible = false;
              this.shape = [];
              return;
            }
          } else {
            // If this is the first vertex
            // Draw shape handle
            this.shapeHandle.x = x - DEFAULTS.handlesize;
            this.shapeHandle.y = y - DEFAULTS.handlesize;
            this.shapeHandle.visible = true;
          }
          // If intermediate vertex, add it to array and redraw the preview
          this.shape.push({ x, y });
          this.shapePreview.clear();
          this.shapePreview.beginFill(DEFAULTS.previewFill);
          this.shapePreview.drawPolygon(hexObjsToArr(this.shape));
          this.shapePreview.endFill();
          this.shapePreview.visible = true;
          break;
        default:
          break;
      }
      // Call _pointermove so single click will still draw brush if mouse does not move
      this._pointerMove(event);
    } else if (event.data.button === 2) {
    // Todo: Not sure why this doesnt trigger when drawing
      this.cancelTool();
    }
  }

  _pointerUp(event) {
  // Only react to left mouse button
    if (event.data.button === 0) {
      const p = event.data.getLocalPosition(canvas.app.stage);

      switch (this.op) {
        // Drag box tool
        case 'box':
          this.renderBrush({
            shape: 'box',
            x: this.dragStart.x,
            y: this.dragStart.y,
            width: p.x - this.dragStart.x,
            height: p.y - this.dragStart.y,
            visible: true,
            fill: game.user.getFlag(this.layername, 'brushOpacity'),
            alpha: 1,
          });
          this.boxPreview.visible = false;
          break;
          // Drag ellipse tool
        case 'ellipse':
          this.renderBrush({
            shape: 'ellipse',
            x: this.dragStart.x,
            y: this.dragStart.y,
            width: Math.abs(p.x - this.dragStart.x),
            height: Math.abs(p.y - this.dragStart.y),
            visible: true,
            fill: game.user.getFlag(this.layername, 'brushOpacity'),
            alpha: 1,
          });
          this.ellipsePreview.visible = false;
          break;
          // Grid tool
        case 'grid':
          this.boxPreview.visible = false;
          break;
        default:
          break;
      }
      // Reset operation
      this.op = false;

      // Push the history buffer
      this.commitHistory();
    }
  }

  /**
   * Aborts any active drawing tools
   */
  cancelTool() {
  // Box preview
    this.boxPreview.visible = false;
    // Ellipse Preview
    this.ellipsePreview.visible = false;
    // Shape preview
    this.shapePreview.clear();
    this.shapePreview.visible = false;
    this.shapeHandle.visible = false;
    this.shape = [];
    // Cancel op flag
    this.op = false;
    // Clear history buffer
    this.historyBuffer = [];
  }

  /**
   * Checks if an array of arrays contains an equivalent to the given array
   * @param arrayOfArrays {Array} Haystack
   * @param array {Array}         Needle
   */
  doesArrayOfArraysContainArray(arrayOfArrays, array) {
    const aOA = arrayOfArrays.map((arr) => arr.slice());
    const a = array.slice(0);
    for (let i = 0; i < aOA.length; i += 1) {
      if (aOA[i].sort().join(',') === a.sort().join(',')) {
        return true;
      }
    }
    return false;
  }
}
