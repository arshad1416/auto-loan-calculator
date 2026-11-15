"""Writes tools/rive/arrow-board/scene.rml: a sequential arrow board (the trailer-mounted
amber lamp panel at lane closures), used as the hero's scroll cue.

    python3 tools/rive/gen_arrow_board.py && rive tools/rive/arrow-board --once

Three downward chevrons of round amber LEDs light one after another, hold, then blank:
96 frames at 60 fps (1.6 s), hard on and off with a short afterglow. State machine inputs:
`hover` (all lamps hold solid; also set by pointer listeners on the panel) and `calm`
(a static lit chevron, for reduced motion).
"""
import math
from pathlib import Path

W, H = 240, 150
CX = W / 2
HALF, DEPTH = 78, 26           # chevron half-width and how far the point drops below the arms
ARMS_Y = (24, 54, 84)          # where each chevron's arms start
PER_ARM = 8                    # lamp gaps per arm; the point lamp is shared
LAMP = 7.6                     # lamp diameter

AMBER_DIM = 'FF2A1A07'
CYCLE, STEP, BLANK_AT, GLOW_END = 96, 24, 72, 80


def lamps(arms_y):
    pts = []
    for k in range(PER_ARM + 1):
        t = k / PER_ARM
        pts.append((CX - HALF * (1 - t), arms_y + DEPTH * t))
    for k in range(PER_ARM - 1, -1, -1):
        t = k / PER_ARM
        pts.append((CX + HALF * (1 - t), arms_y + DEPTH * t))
    return pts


def f(v):
    return f'{v:.2f}'.rstrip('0').rstrip('.')


def dim_lamp(x, y):
    return (f'            <Shape x="{f(x)}" y="{f(y)}" name="Off">\n'
            f'                <Ellipse width="{LAMP}" height="{LAMP}" name="Path"/>\n'
            f'                <Fill name="Fill"><SolidColor colorValue="{AMBER_DIM}" name="Color"/></Fill>\n'
            f'            </Shape>\n')


def lit_lamp(x, y):
    r = LAMP / 2
    return (f'            <Shape x="{f(x)}" y="{f(y)}" name="On">\n'
            f'                <Ellipse width="{LAMP}" height="{LAMP}" name="Path"/>\n'
            f'                <Fill fillRule="clockwise" name="Glow">\n'
            f'                    <SolidColor colorValue="B3FF9408" name="Color"/>\n'
            f'                    <Feather strength="6" name="Feather"/>\n'
            f'                </Fill>\n'
            f'                <Fill name="Lens">\n'
            f'                    <RadialGradient startX="-0.8" startY="-0.8" endX="{f(r + 0.6)}" endY="-0.8" name="Gradient">\n'
            f'                        <GradientStop colorValue="FFFFF3C9" position="0"/>\n'
            f'                        <GradientStop colorValue="FFFFB51E" position="0.5"/>\n'
            f'                        <GradientStop colorValue="FFE27400" position="1"/>\n'
            f'                    </RadialGradient>\n'
            f'                </Fill>\n'
            f'            </Shape>\n')


def keyed(obj_id, keys):
    rows = ''.join(f'                    <KeyFrameDouble value="{v}" frame="{fr}" interpolationType="{it}"/>\n'
                   for fr, v, it in keys)
    return (f'            <KeyedObject objectId="{obj_id}">\n'
            f'                <KeyedProperty property="opacity">\n{rows}'
            f'                </KeyedProperty>\n'
            f'            </KeyedObject>\n')


CHEVRONS = ('0:21', '0:22', '0:23')


def sequence():
    out = ''
    for i, cid in enumerate(CHEVRONS):
        on = i * STEP
        keys = [] if on == 0 else [(0, 0, 'hold')]
        # Hard on, held, then a hard cut to a faint afterglow that dies in ~120 ms.
        keys += [(on, 1, 'hold'), (BLANK_AT, 1, 'hold'), (BLANK_AT + 1, 0.3, 'linear'), (GLOW_END, 0, 'hold'),
                 (CYCLE, 0, 'hold')]
        out += keyed(cid, keys)
    return out


def all_on():
    return ''.join(keyed(cid, [(0, 1, 'hold')]) for cid in CHEVRONS)


def bool_cond(input_id, is_true):
    return f'<TransitionBoolCondition inputId="{input_id}" opValue="{"equal" if is_true else "notEqual"}"/>'


def transition(to, *conds):
    inner = ''.join(f'\n                    {c}' for c in conds)
    return f'                <StateTransition stateToId="{to}" duration="0">{inner}\n                </StateTransition>\n'


CALM, HOVER = '0:40', '0:41'
IDLE, HOLD, STILL = '0:70', '0:71', '0:72'

rml = f'''<Rive version="1" kind="fragment">
    <Artboard defaultStateMachineId="0:7" styleId="0:5" width="{W}" height="{H}" name="Arrow Board" id="0:2">
        <LayoutComponentStyle name="Artboard Style" id="0:5"/>

        <StateMachine name="Board" id="0:7">
            <StateMachineBool name="calm" id="{CALM}"/>
            <StateMachineBool name="hover" id="{HOVER}"/>

            <StateMachineListenerSingle targetId="0:10" listenerTypeValue="enter" name="Pointer in">
                <ListenerBoolChange inputId="{HOVER}" value="true"/>
            </StateMachineListenerSingle>
            <StateMachineListenerSingle targetId="0:10" listenerTypeValue="down" name="Press">
                <ListenerBoolChange inputId="{HOVER}" value="true"/>
            </StateMachineListenerSingle>
            <StateMachineListenerSingle targetId="0:10" listenerTypeValue="exit" name="Pointer out">
                <ListenerBoolChange inputId="{HOVER}" value="false"/>
            </StateMachineListenerSingle>

            <StateMachineLayer name="Lamps" id="0:8">
                <AnyState x="160" y="-120"/>
                <ExitState x="480" y="-120"/>
                <EntryState x="0" y="0">
                    <StateTransition stateToId="{IDLE}"/>
                </EntryState>
                <AnimationState x="160" y="0" animationId="0:60" reset="true" id="{IDLE}">
{transition(STILL, bool_cond(CALM, True))}{transition(HOLD, bool_cond(HOVER, True))}                </AnimationState>
                <AnimationState x="320" y="0" animationId="0:61" id="{HOLD}">
{transition(STILL, bool_cond(HOVER, False), bool_cond(CALM, True))}{transition(IDLE, bool_cond(HOVER, False), bool_cond(CALM, False))}                </AnimationState>
                <AnimationState x="240" y="120" animationId="0:62" id="{STILL}">
{transition(HOLD, bool_cond(HOVER, True))}{transition(IDLE, bool_cond(CALM, False), bool_cond(HOVER, False))}                </AnimationState>
            </StateMachineLayer>
        </StateMachine>

''' + ''.join(
    f'        <Node opacity="0" name="Chevron {i + 1}" id="{cid}">\n'
    + ''.join(lit_lamp(x, y) for x, y in lamps(ARMS_Y[i]))
    + '        </Node>\n' for i, cid in enumerate(CHEVRONS)) + f'''
        <Node name="Lamps off" id="0:20">
{''.join(dim_lamp(x, y) for a in ARMS_Y for x, y in lamps(a))}        </Node>

        <Shape x="{CX}" y="{H / 2}" name="Panel" id="0:10">
            <Rectangle width="{W - 12}" height="{H - 12}" cornerRadiusTL="7" name="Path"/>
            <Fill name="Matte">
                <LinearGradient startX="0" startY="-69" endX="0" endY="69" name="Gradient">
                    <GradientStop colorValue="FF141514" position="0"/>
                    <GradientStop colorValue="FF0A0B0A" position="1"/>
                </LinearGradient>
            </Fill>
            <Stroke thickness="2" name="Frame">
                <SolidColor colorValue="FF3B3E3B" name="Color"/>
            </Stroke>
        </Shape>
        <LinearAnimation loopValue="loop" fps="60" duration="{CYCLE}" name="Sequence" id="0:60">
{sequence()}        </LinearAnimation>
        <LinearAnimation fps="60" duration="1" name="Hold" id="0:61">
{all_on()}        </LinearAnimation>
        <LinearAnimation fps="60" duration="1" name="Calm" id="0:62">
{all_on()}        </LinearAnimation>
    </Artboard>
</Rive>
'''

out = Path(__file__).parent / 'arrow-board'
out.mkdir(exist_ok=True)
(out / 'scene.rml').write_text(rml)
yaml = out / 'rive.yaml'
if not yaml.exists():
    yaml.write_text('name: arrow-board\n')
print('wrote', out / 'scene.rml', f'({sum(len(lamps(a)) for a in ARMS_Y)} lamps)')
