"""Night highway gantry, rendered in Blender (Cycles) for the social card."""
import sys, math
import bpy

out_dir, samples = sys.argv[1], int(sys.argv[2])
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = samples
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = 1200, 630
scene.render.filepath = f"{out_dir}/og.png"
scene.view_settings.view_transform = 'Standard'  # keeps the sign colours true
scene.view_settings.exposure = 0.0

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

def box(name, size, loc, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.name, o.scale = name, size
    o.data.materials.append(mat)
    return o

# Wet asphalt: dark, fairly glossy, roughness broken up by noise so reflections smear.
asphalt = material('asphalt', (0.012, 0.013, 0.013), rough=0.3)
nt = asphalt.node_tree
noise = nt.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 3.0; noise.inputs['Detail'].default_value = 8.0
ramp = nt.nodes.new('ShaderNodeMapRange'); ramp.inputs['To Min'].default_value = 0.06; ramp.inputs['To Max'].default_value = 0.42
fine = nt.nodes.new('ShaderNodeTexNoise'); fine.inputs['Scale'].default_value = 220.0
bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.35
nt.links.new(noise.outputs['Fac'], ramp.inputs['Value'])
nt.links.new(ramp.outputs['Result'], nt.nodes['Principled BSDF'].inputs['Roughness'])
nt.links.new(fine.outputs['Fac'], bump.inputs['Height'])
nt.links.new(bump.outputs['Normal'], nt.nodes['Principled BSDF'].inputs['Normal'])
box('road', (60, 400, 0.1), (0, 150, -0.05), asphalt)

LANE = 3.7
white = material('paint', (0.85, 0.84, 0.78), rough=0.5, emission=(0.9, 0.88, 0.8), strength=0.25)
yellow = material('paint-y', (0.9, 0.62, 0.02), rough=0.5, emission=(1.0, 0.7, 0.05), strength=0.25)
box('edge-r', (0.15, 400, 0.01), (LANE * 1.5, 150, 0.006), white)
box('edge-l', (0.15, 400, 0.01), (-LANE * 1.5, 150, 0.006), yellow)
for i in range(40):
    for x in (-LANE / 2, LANE / 2):
        box('dash', (0.13, 3, 0.01), (x, -6 + i * 9, 0.006), white)

steel = material('steel', (0.05, 0.055, 0.055), rough=0.45, metallic=0.9)
half, G = LANE * 1.5 + 3.1, 17.0
for x in (-half, half):
    box('post', (0.45, 0.45, 9.4), (x, G, 4.7), steel)
for z in (9.1, 7.9):
    box('chord', (half * 2, 0.24, 0.24), (0, G, z), steel)
x = -half + 0.9
while x < half:
    box('web', (0.1, 0.1, 1.2), (x, G, 8.5), steel)
    x += 1.8

sign = bpy.data.materials.new('sign'); sign.use_nodes = True
tex = sign.node_tree.nodes.new('ShaderNodeTexImage'); tex.image = bpy.data.images.load(f"{out_dir}/sign.png")
b = sign.node_tree.nodes['Principled BSDF']
sign.node_tree.links.new(tex.outputs['Color'], b.inputs['Base Color'])
sign.node_tree.links.new(tex.outputs['Color'], b.inputs['Emission Color'])
b.inputs['Emission Strength'].default_value = 0.9
b.inputs['Roughness'].default_value = 0.35
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, G - 0.3, 6.6), rotation=(math.radians(90), 0, 0))
p = bpy.context.object; p.scale = (10.8, 4.5, 1); p.data.materials.append(sign)

# Roadside reflectors and a car a long way ahead.
amber = material('amber', (1, 0.6, 0.1), emission=(1, 0.6, 0.1), strength=6)
red = material('red', (1, 0.05, 0.02), emission=(1, 0.05, 0.02), strength=14)
for i in range(14):
    box('refl', (0.1, 0.02, 0.2), (-(LANE * 1.5 + 1.25), 4 + i * 24, 0.85), amber)
    box('refl', (0.1, 0.02, 0.2), (LANE * 1.5 + 1.25, 4 + i * 24, 0.85), material('w', (1, 1, 1), emission=(1, 1, 0.9), strength=5))
for x in (LANE - 0.7, LANE + 0.7):
    box('tail', (0.28, 0.05, 0.12), (x, 70, 0.8), red)

# Our own low beams.
for x in (-LANE - 0.7, -LANE + 0.7):
    bpy.ops.object.light_add(type='SPOT', location=(x, -9, 0.75), rotation=(math.radians(86), 0, 0))
    l = bpy.context.object.data
    l.energy, l.spot_size, l.spot_blend, l.color = 30000, math.radians(70), 0.8, (1.0, 0.95, 0.85)

# Dusk sky: dark overhead, a warm band on the horizon.
world = bpy.data.worlds.new('dusk'); scene.world = world; world.use_nodes = True
wn = world.node_tree
coord = wn.nodes.new('ShaderNodeTexCoord'); sep = wn.nodes.new('ShaderNodeSeparateXYZ')
cr = wn.nodes.new('ShaderNodeValToRGB')
# Generated Z is the view direction: 0 at the horizon, 1 straight up.
cr.color_ramp.elements[0].position, cr.color_ramp.elements[0].color = 0.0, (0.12, 0.045, 0.006, 1)
cr.color_ramp.elements[1].position, cr.color_ramp.elements[1].color = 0.2, (0.001, 0.004, 0.006, 1)
mid = cr.color_ramp.elements.new(0.045); mid.color = (0.008, 0.04, 0.038, 1)
wn.links.new(coord.outputs['Generated'], sep.inputs['Vector'])
wn.links.new(sep.outputs['Z'], cr.inputs['Fac'])
wn.links.new(cr.outputs['Color'], wn.nodes['Background'].inputs['Color'])

# Spruce silhouettes down both verges.
import random
random.seed(11)
bark = material('spruce', (0.002, 0.004, 0.003), rough=1.0)
for i in range(260):
    side = random.choice((-1, 1))
    h = random.uniform(7, 17)
    bpy.ops.mesh.primitive_cone_add(vertices=7, radius1=h * random.uniform(0.1, 0.15), depth=h,
                                    location=(side * random.uniform(19, 46), random.uniform(-5, 330), h / 2))
    bpy.context.object.data.materials.append(bark)

bpy.ops.object.camera_add(location=(-LANE - 0.3, -6.0, 1.15), rotation=(math.radians(101.5), 0, math.radians(-8.0)))
cam = bpy.context.object; cam.data.lens = 27; scene.camera = cam
bpy.ops.render.render(write_still=True)
print('render ok')
