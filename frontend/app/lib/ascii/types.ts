export type PaletteEntry = {
  char: string
  weight: number
  italic: boolean
  width: number
  brightness: number
  font: string
}

export type RenderOptions = {
  cols: number
  rows: number
  fontSize: number
  fontFamily?: string
}

export type ParticleConfig = {
  count: number
  attractors: number
  speed: number
  decay: number
}

export type Particle = {
  x: number
  y: number
  vx: number
  vy: number
}

export type Attractor = {
  x: number
  y: number
  strength: number
}
