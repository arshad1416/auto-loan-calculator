"""Hero poster: the night highway from the driver's seat, rendered in Blender (Cycles).

Run headless:  Blender -b --python tools/hero-poster/render.py -- <work_dir> <samples> [scale%]
<work_dir> must hold gantry-sign.png from sign.py; the render lands in <work_dir>/hero-raw.png
(display-referred 8-bit, no grain or bloom; post.py finishes it).
"""
import math
import random
import sys

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:]
work, samples = argv[0], int(argv[1])
scale = int(argv[2]) if len(argv) > 2 else 100

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'

# Metal GPU when there is one, else the CPU.
prefs = bpy.context.preferences.addons['cycles'].preferences
try:
    prefs.compute_device_type = 'METAL'
    prefs.get_devices()
    gpus = [d for d in prefs.devices if d.type == 'METAL']
    for d in prefs.devices:
        d.use = d.type == 'METAL'
    scene.cycles.device = 'GPU' if gpus else 'CPU'
except (TypeError, ValueError):
    scene.cycles.device = 'CPU'
print('cycles device:', scene.cycles.device)

scene.cycles.samples = samples
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 6
scene.cycles.caustics_reflective = False
scene.cycles.caustics_refractive = False
scene.cycles.blur_glossy = 1.0
scene.render.resolution_x, scene.render.resolution_y = 2560, 1440
scene.render.resolution_percentage = scale
scene.render.film_transparent = False
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_depth = '8'
scene.render.dither_intensity = 1.0  # Pillow reads 8-bit; dithering here keeps the dark sky from banding
scene.render.filepath = f"{work}/hero-raw.png"
scene.view_settings.view_transform = 'Filmic'
try:
    scene.view_settings.look = 'Filmic - Medium High Contrast'
except TypeError:
    try:
        scene.view_settings.look = 'Medium High Contrast'
    except TypeError:
        pass
scene.view_settings.exposure = 0.6

random.seed(7)
LANE = 3.7
EDGE = LANE * 1.5


def material(name, color, rough=0.6, metallic=0.0, emission=None, strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metallic
    if emission:
        b.inputs['Emission Color'].default_value = (*emission, 1)
        b.inputs['Emission Strength'].default_value = strength
    return m


def emitter(name, color, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    e = nt.nodes.new('ShaderNodeEmission')
    e.inputs['Color'].default_value = (*color, 1)
    e.inputs['Strength'].default_value = strength
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(e.outputs['Emission'], out.inputs['Surface'])
    return m


# Geometry is batched into one mesh per material: thousands of bpy.ops calls
# make scene building crawl, and Cycles is happier with few objects.
_batches = {}


def _bm(mat):
    if mat.name not in _batches:
        _batches[mat.name] = (mat, bmesh.new())
    return _batches[mat.name][1]


def box(name, size, loc, mat, rot=(0, 0, 0)):
    m = Matrix.LocRotScale(Vector(loc), Euler(rot), Vector(size))
    bmesh.ops.create_cube(_bm(mat), size=1.0, matrix=m)


def cone(loc, r, depth, mat, segments=9):
    bmesh.ops.create_cone(_bm(mat), cap_ends=True, cap_tris=False, segments=segments,
                          radius1=r, radius2=0.0, depth=depth, matrix=Matrix.Translation(Vector(loc)))


def sphere(loc, r, mat):
    bmesh.ops.create_uvsphere(_bm(mat), u_segments=12, v_segments=8, radius=r, matrix=Matrix.Translation(Vector(loc)))


def flush():
    for name, (mat, bm) in _batches.items():
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        me.materials.append(mat)
        scene.collection.objects.link(bpy.data.objects.new(name, me))
    _batches.clear()


def image_panel(name, path, size, loc, rot_z=0.0, glow=0.35):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(path)
    b = nt.nodes['Principled BSDF']
    nt.links.new(tex.outputs['Color'], b.inputs['Base Color'])
    nt.links.new(tex.outputs['Color'], b.inputs['Emission Color'])
    # Retroreflective sheeting: it throws headlight back, so a touch of self-light.
    b.inputs['Emission Strength'].default_value = glow
    b.inputs['Roughness'].default_value = 0.4
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=(math.radians(90), 0, rot_z))
    p = bpy.context.object
    p.name = name
    p.scale = (size[0], size[1], 1)
    p.data.materials.append(m)
    return p


# ── Road ───────────────────────────────────────────────────────────────
# Wet asphalt: near-black, glossy in puddled patches and matte between them,
# with fine aggregate in the normal so reflections break into streaks.
asphalt = material('asphalt', (0.010, 0.011, 0.011), rough=0.25)
nt = asphalt.node_tree
bsdf = nt.nodes['Principled BSDF']
coord = nt.nodes.new('ShaderNodeTexCoord')
stretch = nt.nodes.new('ShaderNodeMapping')
stretch.inputs['Scale'].default_value = (1.0, 0.25, 1.0)  # puddles run along the road
nt.links.new(coord.outputs['Object'], stretch.inputs['Vector'])
patches = nt.nodes.new('ShaderNodeTexNoise')
patches.inputs['Scale'].default_value = 0.035
patches.inputs['Detail'].default_value = 6.0
nt.links.new(stretch.outputs['Vector'], patches.inputs['Vector'])
rough = nt.nodes.new('ShaderNodeMapRange')
rough.inputs['From Min'].default_value = 0.42
rough.inputs['From Max'].default_value = 0.6
rough.inputs['To Min'].default_value = 0.04
rough.inputs['To Max'].default_value = 0.5
nt.links.new(patches.outputs['Fac'], rough.inputs['Value'])
nt.links.new(rough.outputs['Result'], bsdf.inputs['Roughness'])
grit = nt.nodes.new('ShaderNodeTexNoise')
grit.inputs['Scale'].default_value = 900.0
grit.inputs['Detail'].default_value = 2.0
bump = nt.nodes.new('ShaderNodeBump')
bump.inputs['Strength'].default_value = 0.18
bump.inputs['Distance'].default_value = 0.002
nt.links.new(grit.outputs['Fac'], bump.inputs['Height'])
nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
box('road', (EDGE * 2 + 3.0, 1200, 0.1), (0, 590, -0.05), asphalt)
# Far carriageway, beyond the median.
box('road-far', (EDGE * 2 + 2.0, 1200, 0.1), (-EDGE * 2 - 11.5, 590, -0.05), asphalt)

grass = material('verge', (0.0025, 0.0035, 0.002), rough=1.0)
box('verge-r', (60, 1200, 0.1), (EDGE + 1.5 + 30, 590, -0.07), grass)
box('median', (8.2, 1200, 0.1), (-EDGE - 1.5 - 4.1, 590, -0.07), grass)
box('verge-l', (60, 1200, 0.1), (-EDGE * 3 - 14 - 30, 590, -0.07), grass)

paint = material('paint', (0.42, 0.41, 0.37), rough=0.45)
paint_y = material('paint-y', (0.42, 0.25, 0.01), rough=0.45)
box('edge-r', (0.15, 1200, 0.008), (EDGE, 590, 0.004), paint)
box('edge-l', (0.15, 1200, 0.008), (-EDGE, 590, 0.004), paint_y)
for i in range(70):
    for x in (-LANE / 2, LANE / 2):
        box('dash', (0.13, 3.0, 0.008), (x, 2 + i * 12, 0.004), paint)

# ── Roadside ───────────────────────────────────────────────────────────
post_mat = material('post', (0.006, 0.007, 0.006), rough=0.8)
refl_w = emitter('refl-w', (1.0, 0.97, 0.88), 9.0)
refl_a = emitter('refl-a', (1.0, 0.55, 0.08), 9.0)
for i in range(40):
    y = 22 + i * 24
    for x, mat in ((EDGE + 1.25, refl_w), (-EDGE - 1.25, refl_a)):
        box('delineator', (0.08, 0.08, 1.0), (x, y, 0.5), post_mat)
        box('refl', (0.07, 0.02, 0.16), (x, y - 0.05, 0.88), mat)

# Guardrail along the right verge.
rail = material('rail', (0.05, 0.055, 0.055), rough=0.6, metallic=1.0)
box('rail', (0.05, 1200, 0.3), (EDGE + 2.4, 590, 0.65), rail)
for i in range(300):
    box('rail-post', (0.12, 0.12, 0.75), (EDGE + 2.5, 3 + i * 4, 0.375), post_mat)

# ── Gantry with the guide sign ─────────────────────────────────────────
steel = material('steel', (0.05, 0.055, 0.055), rough=0.45, metallic=0.9)
G = 78.0
half = EDGE + 3.1
for x in (-half, half):
    box('post', (0.42, 0.42, 9.4), (x, G, 4.7), steel)
for z in (9.1, 7.9):
    box('chord', (half * 2, 0.22, 0.22), (0, G, z), steel)
x = -half + 0.9
while x < half:
    box('web', (0.1, 0.1, 1.2), (x, G, 8.5), steel)
    x += 1.8
# Over the two right lanes, the way a guide sign sits over the lanes it serves.
image_panel('gantry-sign', f"{work}/gantry-sign.png", (10.6, 4.15), (1.9, G - 0.3, 6.75), glow=0.55)
# Sign lights: a row of downlights on the gantry washing the face.
for x in (-2.6, 1.9, 6.4):
    bpy.ops.object.light_add(type='SPOT', location=(x, G - 2.2, 9.4), rotation=(math.radians(-30), 0, 0))
    l = bpy.context.object.data
    l.energy, l.spot_size, l.spot_blend, l.color = 900, math.radians(55), 0.9, (1.0, 0.92, 0.8)
    l.use_shadow = False


# ── Traffic: only lights, no bodies ────────────────────────────────────
tail = emitter('tail', (1.0, 0.04, 0.015), 45.0)
for x in (LANE / 2 + 0.65 - 0.72, LANE / 2 + 0.65 + 0.72):
    box('tail', (0.3, 0.04, 0.12), (x, 58, 0.82), tail)

# A second pair of tail lights far ahead, and oncoming headlights on the far carriageway.
for x in (-LANE - 0.72, -LANE + 0.72):
    box('tail2', (0.26, 0.04, 0.1), (x, 210, 0.8), tail)
head = emitter('head', (1.0, 0.93, 0.8), 220.0)
for y, xc in ((330, -EDGE * 2 - 11.5 + 1.8), (520, -EDGE * 2 - 11.5 - 1.8)):
    for dx in (-0.75, 0.75):
        sphere((xc + dx, y, 0.7), 0.1, head)

# Our own low beams.
for x in (-LANE - 0.4 - 0.75, -LANE - 0.4 + 0.75):
    bpy.ops.object.light_add(type='SPOT', location=(x, -1.6, 0.7), rotation=(math.radians(84.5), 0, math.radians(-2)))
    l = bpy.context.object.data
    l.energy, l.spot_size, l.spot_blend, l.color = 9000, math.radians(40), 0.85, (1.0, 0.93, 0.8)
    l.shadow_soft_size = 0.08

# ── Spruce treeline ────────────────────────────────────────────────────
bark = bpy.data.materials.new('spruce')
bark.use_nodes = True
_t = bark.node_tree
_t.nodes.clear()
# Pure silhouette that lifts toward the horizon haze with distance (atmospheric perspective).
_cam = _t.nodes.new('ShaderNodeCameraData')
_d = _t.nodes.new('ShaderNodeMapRange')
_d.inputs['From Min'].default_value = 20.0
_d.inputs['From Max'].default_value = 600.0
_d.inputs['To Min'].default_value = 0.0
_d.inputs['To Max'].default_value = 0.0034
_t.links.new(_cam.outputs['View Distance'], _d.inputs['Value'])
_e = _t.nodes.new('ShaderNodeEmission')
_e.inputs['Color'].default_value = (0.75, 0.95, 1.0, 1)
_t.links.new(_d.outputs['Result'], _e.inputs['Strength'])
_o = _t.nodes.new('ShaderNodeOutputMaterial')
_t.links.new(_e.outputs['Emission'], _o.inputs['Surface'])


def spruce(x, y, h):
    tiers = random.randint(9, 14)
    r0 = h * random.uniform(0.12, 0.17)
    cone((x, y, h * 0.5), 0.12, h, bark, segments=5)  # trunk and leader
    for t in range(tiers):
        f = (t + random.uniform(0.0, 0.5)) / tiers
        depth = h * random.uniform(0.18, 0.3) * (1.1 - f)
        z = h * (0.12 + f * 0.82)
        r = r0 * (1 - f) ** 0.9 * random.uniform(0.6, 1.25)
        cone((x + random.uniform(-0.3, 0.3) * r, y + random.uniform(-0.3, 0.3) * r, z), r, depth, bark,
             segments=random.randint(5, 8))


for i in range(520):
    side = random.choice((-1, 1, 1))
    if side > 0:
        x = random.uniform(EDGE + 9, EDGE + 40)
    else:
        x = random.uniform(-EDGE * 3 - 22, -EDGE * 3 - 55)
    spruce(x, random.uniform(8, 900), random.uniform(9, 22))
# A few in the median, kept low and sparse.
for i in range(40):
    spruce(random.uniform(-EDGE - 4.5, -EDGE - 7.5), random.uniform(60, 900), random.uniform(4, 8))

# ── Sky: deep night, stars, faint aurora low in the north ──────────────
world = bpy.data.worlds.new('night')
scene.world = world
world.use_nodes = True
wn = world.node_tree
bg = wn.nodes['Background']
tc = wn.nodes.new('ShaderNodeTexCoord')
sep = wn.nodes.new('ShaderNodeSeparateXYZ')
wn.links.new(tc.outputs['Generated'], sep.inputs['Vector'])

base = wn.nodes.new('ShaderNodeValToRGB')  # Z: 0 horizon → 1 zenith
base.color_ramp.elements[0].position, base.color_ramp.elements[0].color = 0.0, (0.0028, 0.0042, 0.0046, 1)
base.color_ramp.elements[1].position, base.color_ramp.elements[1].color = 0.3, (0.0002, 0.0004, 0.0007, 1)
wn.links.new(sep.outputs['Z'], base.inputs['Fac'])

# Stars: sparse Voronoi points, brightness varied.
vor = wn.nodes.new('ShaderNodeTexVoronoi')
vor.feature = 'F1'
vor.inputs['Scale'].default_value = 420.0
wn.links.new(tc.outputs['Generated'], vor.inputs['Vector'])
star = wn.nodes.new('ShaderNodeMapRange')
star.inputs['From Min'].default_value = 0.13
star.inputs['From Max'].default_value = 0.0
star.inputs['To Min'].default_value = 0.0
star.inputs['To Max'].default_value = 1.0
wn.links.new(vor.outputs['Distance'], star.inputs['Value'])
keep = wn.nodes.new('ShaderNodeMath')
keep.operation = 'GREATER_THAN'
keep.inputs[1].default_value = 0.86
wn.links.new(vor.outputs['Color'], keep.inputs[0])  # Color is a per-cell random; >0.82 keeps ~18% of cells
starmask = wn.nodes.new('ShaderNodeMath')
starmask.operation = 'MULTIPLY'
wn.links.new(star.outputs['Result'], starmask.inputs[0])
wn.links.new(keep.outputs['Value'], starmask.inputs[1])
starpow = wn.nodes.new('ShaderNodeMath')
starpow.operation = 'MULTIPLY'
starpow.inputs[1].default_value = 0.35
wn.links.new(starmask.outputs['Value'], starpow.inputs[0])
# Fade stars into the horizon haze.
fade = wn.nodes.new('ShaderNodeMapRange')
fade.inputs['From Min'].default_value = 0.02
fade.inputs['From Max'].default_value = 0.15
wn.links.new(sep.outputs['Z'], fade.inputs['Value'])
starfade = wn.nodes.new('ShaderNodeMath')
starfade.operation = 'MULTIPLY'
wn.links.new(starpow.outputs['Value'], starfade.inputs[0])
wn.links.new(fade.outputs['Result'], starfade.inputs[1])

# Aurora: a soft green curtain banded along X, strongest to the right of the road.
aur_noise = wn.nodes.new('ShaderNodeTexNoise')
aur_noise.inputs['Scale'].default_value = 2.2
aur_noise.inputs['Detail'].default_value = 3.0
aur_map = wn.nodes.new('ShaderNodeMapping')
aur_map.inputs['Scale'].default_value = (3.0, 0.4, 0.6)
wn.links.new(tc.outputs['Generated'], aur_map.inputs['Vector'])
wn.links.new(aur_map.outputs['Vector'], aur_noise.inputs['Vector'])
aur_band = wn.nodes.new('ShaderNodeValToRGB')  # height band
aur_band.color_ramp.elements[0].position, aur_band.color_ramp.elements[0].color = 0.06, (0, 0, 0, 1)
aur_band.color_ramp.elements[1].position, aur_band.color_ramp.elements[1].color = 0.45, (0, 0, 0, 1)
mid = aur_band.color_ramp.elements.new(0.16)
mid.color = (1, 1, 1, 1)
wn.links.new(sep.outputs['Z'], aur_band.inputs['Fac'])
aur_side = wn.nodes.new('ShaderNodeMapRange')  # X: camera faces +Y, so +X is to the right
aur_side.inputs['From Min'].default_value = -0.1
aur_side.inputs['From Max'].default_value = 0.6
wn.links.new(sep.outputs['X'], aur_side.inputs['Value'])
aur_streak = wn.nodes.new('ShaderNodeMapRange')
aur_streak.inputs['From Min'].default_value = 0.45
aur_streak.inputs['From Max'].default_value = 0.75
wn.links.new(aur_noise.outputs['Fac'], aur_streak.inputs['Value'])
a1 = wn.nodes.new('ShaderNodeMath'); a1.operation = 'MULTIPLY'
a2 = wn.nodes.new('ShaderNodeMath'); a2.operation = 'MULTIPLY'
wn.links.new(aur_band.outputs['Color'], a1.inputs[0])
wn.links.new(aur_streak.outputs['Result'], a1.inputs[1])
wn.links.new(a1.outputs['Value'], a2.inputs[0])
wn.links.new(aur_side.outputs['Result'], a2.inputs[1])
aur_col = wn.nodes.new('ShaderNodeMix')
aur_col.data_type = 'RGBA'
aur_col.blend_type = 'MIX'
aur_col.inputs['A'].default_value = (0, 0, 0, 1)
aur_col.inputs['B'].default_value = (0.0016, 0.022, 0.012, 1)
wn.links.new(a2.outputs['Value'], aur_col.inputs['Factor'])

add1 = wn.nodes.new('ShaderNodeMix'); add1.data_type = 'RGBA'; add1.blend_type = 'ADD'
add1.inputs['Factor'].default_value = 1.0
wn.links.new(base.outputs['Color'], add1.inputs['A'])
wn.links.new(aur_col.outputs['Result'], add1.inputs['B'])
add2 = wn.nodes.new('ShaderNodeMix'); add2.data_type = 'RGBA'; add2.blend_type = 'ADD'
add2.inputs['Factor'].default_value = 1.0
wn.links.new(add1.outputs['Result'], add2.inputs['A'])
starrgb = wn.nodes.new('ShaderNodeCombineXYZ')
for k in ('X', 'Y', 'Z'):
    wn.links.new(starfade.outputs['Value'], starrgb.inputs[k])
wn.links.new(starrgb.outputs['Vector'], add2.inputs['B'])
wn.links.new(add2.outputs['Result'], bg.inputs['Color'])
bg.inputs['Strength'].default_value = 1.0

flush()

# ── Camera: driver's seat, left lane, a 35 mm lens shot wide open ──────
bpy.ops.object.camera_add(location=(-LANE - 0.4, 0.0, 1.25), rotation=(math.radians(88.6), 0, math.radians(-1.2)))
cam = bpy.context.object
cam.data.lens = 30
cam.data.sensor_width = 36
cam.data.shift_x = -0.14   # pushes the vanishing point right of centre
cam.data.shift_y = 0.02
cam.data.dof.use_dof = True
cam.data.dof.focus_distance = 60.0
cam.data.dof.aperture_fstop = 1.8
cam.data.dof.aperture_blades = 7
scene.camera = cam

bpy.ops.render.render(write_still=True)
print('render ok', scene.render.filepath)
