import fs from 'fs'
import path from 'path'
import { Canvas, loadImage } from 'skia-canvas'
import inks from './inks.js'

const __dirname = path.dirname(new URL(import.meta.url).pathname)

const pageSize = {
  width: 11.75 * 300,
  height: 16.5 * 300
}

const rgbToHSL = (r, g, b) => {
  // Convert RGB to 0-1 range
  r = r / 255
  g = g / 255
  b = b / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      case b: h = (r - g) / d + 4; break
    }

    h = h * 60
  }

  // Convert to desired ranges
  return {
    h: Math.round(h), // 0-359
    s: Math.round(s * 100), // 0-100
    l: Math.round(l * 100) // 0-100
  }
}

class Rand {
  constructor(seed) {
    // PRNG from Piter
    const S = Uint32Array.of(9, 7, 5, 3)
    // eslint-disable-next-line no-return-assign
    this.prng = (a = 1) =>
      a *
      ((a = S[3]),
        (S[3] = S[2]),
        (S[2] = S[1]),
        (a ^= a << 11),
        (S[0] ^= a ^ (a >>> 8) ^ ((S[1] = S[0]) >>> 19)),
        S[0] / 2 ** 32);
    [...`${seed}`].map((c) =>
      this.prng((S[3] ^= c.charCodeAt() * 23205))
    )
  }

  r_d() {
    // random between 0 and 1
    return this.prng()
  }

  r_n(a, b) {
    // random float between a and b
    return a + (b - a) * this.r_d()
  }

  r_i(a, b) {
    // random int between a and b
    return ~~this.r_n(a, b + 1)
  }

  r_b(p) {
    // random boolean with probability of p
    return this.r_d() < p
  }

  r_c(list) {
    // random choice from list
    return list[this.r_i(0, list.length - 1)]
  }
}

const genTokenData = (projectNum) => {
  const data = {}
  let hash = '0x'
  for (let i = 0; i < 64; i++) {
    hash += Math.floor(Math.random() * 16).toString(16)
  }
  data.hash = hash
  data.tokenId = (
    projectNum * 1000000 +
    Math.floor(Math.random() * 1000)
  ).toString()
  return data
}

const makeFeatures = async (tokenData) => {
  const { hash } = tokenData
  const R = new Rand(hash)

  // We are going to be make of two colours, so let's pick those two now
  const firstColour = R.r_c(inks)
  let secondColour = R.r_c(inks)
  while (secondColour.name === firstColour.name) {
    secondColour = R.r_c(inks)
  }

  // Pick what type of background we want
  /*
  let firstType = R.r_c(['none', 'solid', 'gradient'])
  let secondType = R.r_c(['none', 'solid', 'gradient'])
  while (firstType === 'none' && secondType === 'none') {
    firstType = R.r_c(['none', 'solid', 'gradient'])
    secondType = R.r_c(['none', 'solid', 'gradient'])
  }
  */

  const firstType = R.r_c(['solid', 'gradient'])
  const secondType = R.r_c(['solid', 'gradient'])

  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  //
  // Now we are going to back the background design
  //
  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

  const grid = []
  let things = ['circle', 'cross', 'plus', 'semicircle']
  const opacities = [0.2, 0.5, 0.5]

  // things = ['semicircle']
  const allOneThing = R.prng() < 0.2
  let solidRandomChance = R.prng() * 0.3333 + 0.3333
  const allSolid = R.prng() < 0.2
  const allHollow = R.prng() < 0.2
  if (allSolid) solidRandomChance = 1
  if (allHollow) solidRandomChance = 0
  let showDot = 0.25
  const showAll = R.prng() < 0.1
  if (showAll) showDot = 1

  // If we are doing just one thing, make the things array be just one of the items picked at random
  if (allOneThing) things = [things[Math.floor(R.prng() * things.length)]]
  // Now make the grid of things, which is 3 to 6 columns
  const maxDotX = Math.floor(R.prng() * 4 + 3)
  const maxDotY = Math.floor(maxDotX * 1.5)

  for (let y = 0; y < maxDotY; y++) {
    for (let x = 0; x < maxDotX; x++) {
      if (R.prng() > showDot) continue

      const dot = {
        x: x / maxDotX,
        y: y / maxDotY,
        thing: things[Math.floor(R.prng() * things.length)],
        fill: R.prng() < solidRandomChance,
        size: 1 / maxDotX / 2,
        rotationAngle: 0
      }
      if (dot.thing === 'plus') dot.rotationAngle = 45
      if (dot.thing === 'semicircle') {
        dot.rotationAngle = Math.floor(R.prng() * 8) * 45
      }
      grid.push(dot)
    }
  }

  let gridFirstColourOpacity = 0
  let gridSecondColourOpacity = 0
  if (R.prng() < 0.5) gridFirstColourOpacity = opacities[Math.floor(R.prng() * opacities.length)]
  if (R.prng() < 0.5) gridSecondColourOpacity = opacities[Math.floor(R.prng() * opacities.length)]

  const gridFirstNudge = {
    x: 0,
    y: 0
  }
  const gridSecondNudge = {
    x: 0,
    y: 0
  }
  if (R.prng() < 0.5) {
    gridFirstNudge.x = R.prng() - 0.5
    gridFirstNudge.y = R.prng() - 0.5
  }
  if (R.prng() < 0.5) {
    gridSecondNudge.x = R.prng() - 0.5
    gridSecondNudge.y = R.prng() - 0.5
  }

  return {
    tokenData,
    firstColour,
    secondColour,
    background: {
      firstColour: {
        type: firstType,
        dark: R.r_b(0.33)
      },
      secondColour: {
        type: secondType,
        dark: R.r_b(0.5)
      },
      flipped: R.r_b(0.33)
    },
    grid,
    gridFirstColourOpacity,
    gridSecondColourOpacity,
    gridFirstNudge,
    gridSecondNudge
  }
}

const drawBackgroundDesign = (designCtx, features, shapeOpacity, nudge, w, h, borderSize) => {
  const gridScaleMod = 0.8
  const shapeSizeMod = 0.666
  designCtx.lineWidth = w / 300
  designCtx.lineCap = 'round'
  designCtx.join = 'round'
  // Set the canvas origin to the middle
  designCtx.save()
  designCtx.translate(w / 2 + (nudge.x * w / 200), h / 2 + (nudge.y * w / 200))
  for (let i = 0; i < features.grid.length; i++) {
    const thisDot = features.grid[i]
    const middle = {
      x: (thisDot.x * w - w / 2 + thisDot.size * w) * gridScaleMod,
      y: (thisDot.y * h - h / 2 + thisDot.size * w) * gridScaleMod
    }

    designCtx.save()
    designCtx.translate(middle.x, middle.y)
    designCtx.rotate((thisDot.rotationAngle * Math.PI) / 180)
    designCtx.beginPath()

    // If it's a circle
    if (thisDot.thing === 'circle') {
      designCtx.arc(0, 0, thisDot.size * w * shapeSizeMod, 0, Math.PI * 2)
      designCtx.lineTo(thisDot.size * w * shapeSizeMod, 0)
    }

    if (thisDot.thing === 'semicircle') {
      designCtx.moveTo(0, 0)
      designCtx.arc(0, 0, thisDot.size * w * shapeSizeMod, 0, Math.PI)
      designCtx.lineTo(0, 0)
    }

    if (thisDot.thing === 'cross' || thisDot.thing === 'plus') {
      // If it's a plus, then we need to roate the canvas 45 degrees
      const crossSize = thisDot.size * w * shapeSizeMod
      const crossWidth = crossSize / 2
      const crossHeight = crossSize / 2
      designCtx.moveTo(-crossWidth, -crossHeight * 2)
      designCtx.lineTo(0, -crossHeight)
      designCtx.lineTo(crossWidth, -crossHeight * 2)
      designCtx.lineTo(crossWidth * 2, -crossHeight)
      designCtx.lineTo(crossWidth, 0)
      designCtx.lineTo(crossWidth * 2, crossHeight)
      designCtx.lineTo(crossWidth, crossHeight * 2)
      designCtx.lineTo(0, crossHeight)
      designCtx.lineTo(-crossWidth, crossHeight * 2)
      designCtx.lineTo(-crossWidth * 2, crossHeight)
      designCtx.lineTo(-crossWidth, 0)
      designCtx.lineTo(-crossWidth * 2, -crossHeight)
      designCtx.closePath()
    }

    if (thisDot.fill) {
      designCtx.fillStyle = '#FFFFFF'
      designCtx.fill()
      if (shapeOpacity > 0) {
        designCtx.globalAlpha = shapeOpacity
        designCtx.fillStyle = '#000000'
        designCtx.fill()
        designCtx.globalAlpha = 1
      }
    } else {
      designCtx.strokeStyle = '#FFFFFF'
      designCtx.stroke()
      if (shapeOpacity > 0) {
        designCtx.globalAlpha = shapeOpacity
        designCtx.strokeStyle = '#000000'
        designCtx.stroke()
        designCtx.globalAlpha = 1
      }
    }
    // Restore the canvas
    designCtx.restore()
  }
  // Set the canvas back
  designCtx.restore()
}

const main = async () => {
  const tokenData = genTokenData(123)
  const features = await makeFeatures(tokenData)
  console.log(features)

  // Create a scratchPad canvas
  const scratchPadCanvas = new Canvas(pageSize.width, pageSize.height)
  const scratchPadCtx = scratchPadCanvas.getContext('2d')

  // Draw the background
  scratchPadCtx.fillStyle = 'white'
  scratchPadCtx.fillRect(0, 0, pageSize.width, pageSize.height)

  // Now we are going to make the canvas we need for the actual design
  const designCanvas = new Canvas(pageSize.width, pageSize.height)
  const designCtx = designCanvas.getContext('2d')

  // Draw the background
  designCtx.fillStyle = 'white'
  designCtx.fillRect(0, 0, pageSize.width, pageSize.height)

  // First we are going to draw everything we need for the first colour
  if (features.background.firstColour.type === 'solid') {
    // Grab the first colour
    let thisColour = 'hsl(0, 0%, 90%)'
    if (features.background.firstColour.dark) thisColour = 'hsl(0, 0%, 50%)'
    designCtx.fillStyle = thisColour
    designCtx.fillRect(0, 0, pageSize.width, pageSize.height)
  }

  if (features.background.firstColour.type === 'gradient') {
    let thisGradient = designCtx.createLinearGradient(0, 0, 0, pageSize.height)
    if (features.background.flipped) {
      thisGradient = designCtx.createLinearGradient(0, pageSize.height, 0, 0)
    }
    if (features.background.firstColour.dark) {
      thisGradient.addColorStop(1, 'hsl(0, 0%, 70%)')
      thisGradient.addColorStop(0, 'hsl(0, 0%, 30%)')
    } else {
      thisGradient.addColorStop(0, 'hsl(0, 0%, 90%)')
      thisGradient.addColorStop(1, 'hsl(0, 0%, 50%)')
    }
    designCtx.fillStyle = thisGradient
    designCtx.fillRect(0, 0, pageSize.width, pageSize.height)
  }

  // Add border
  const borderWidth = 250
  designCtx.fillStyle = 'white'
  designCtx.fillRect(0, 0, pageSize.width, borderWidth)
  designCtx.fillRect(0, 0, borderWidth, pageSize.height)
  designCtx.fillRect(0, pageSize.height - borderWidth, pageSize.width, borderWidth)
  designCtx.fillRect(pageSize.width - borderWidth, 0, borderWidth, pageSize.height)

  await drawBackgroundDesign(designCtx, features, features.gridFirstColourOpacity, features.gridFirstNudge, pageSize.width, pageSize.height, borderWidth)

  // Save the design canvas
  let buffer = await designCanvas.toBuffer()
  fs.writeFileSync(path.join(__dirname, '01 colour one.png'), buffer)

  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

  // Then we are going to draw everything we need for the second colour
  // Wipe the design canvas
  designCtx.fillStyle = 'white'
  designCtx.fillRect(0, 0, pageSize.width, pageSize.height)

  if (features.background.secondColour.type === 'solid') {
    // Grab the first colour
    let thisColour = 'hsl(0, 0%, 90%)'
    if (features.background.secondColour.dark) thisColour = 'hsl(0, 0%, 50%)'
    designCtx.fillStyle = thisColour
    designCtx.fillRect(0, 0, pageSize.width, pageSize.height)
  }

  if (features.background.secondColour.type === 'gradient') {
    let thisGradient = designCtx.createLinearGradient(0, 0, 0, pageSize.height)
    if (features.background.flipped) {
      thisGradient = designCtx.createLinearGradient(0, pageSize.height, 0, 0)
    }
    if (features.background.secondColour.dark) {
      thisGradient.addColorStop(1, 'hsl(0, 0%, 70%)')
      thisGradient.addColorStop(0, 'hsl(0, 0%, 30%)')
    } else {
      thisGradient.addColorStop(0, 'hsl(0, 0%, 90%)')
      thisGradient.addColorStop(1, 'hsl(0, 0%, 50%)')
    }
    designCtx.fillStyle = thisGradient
    designCtx.fillRect(0, 0, pageSize.width, pageSize.height)
  }

  designCtx.fillStyle = 'white'
  designCtx.fillRect(0, 0, pageSize.width, borderWidth)
  designCtx.fillRect(0, 0, borderWidth, pageSize.height)
  designCtx.fillRect(0, pageSize.height - borderWidth, pageSize.width, borderWidth)
  designCtx.fillRect(pageSize.width - borderWidth, 0, borderWidth, pageSize.height)

  await drawBackgroundDesign(designCtx, features, features.gridSecondColourOpacity, features.gridSecondNudge, pageSize.width, pageSize.height, borderWidth)

  // Save the design canvas a SECOND time
  buffer = await designCanvas.toBuffer()
  fs.writeFileSync(path.join(__dirname, '02 colour two.png'), buffer)

  // Now we are going to wipe the design canvas _again_
  designCtx.fillStyle = 'white'
  designCtx.fillRect(0, 0, pageSize.width, pageSize.height)

  // Grab the first colour
  const firstColour = `rgb(${features.firstColour.r}, ${features.firstColour.g}, ${features.firstColour.b})`
  const secondColour = `rgb(${features.secondColour.r}, ${features.secondColour.g}, ${features.secondColour.b})`

  // Now we want to use screen mode and use the two images we've created as "masks"
  // to overlay the two images on top of each other, so we're going to need to
  // read them back in as image

  // First load the first image in as an image
  const firstImage = await loadImage(path.join(__dirname, '01 colour one.png'))
  const secondImage = await loadImage(path.join(__dirname, '02 colour two.png'))

  // Now we want to use screen mode and use the two images we've created as "masks"
  // to overlay the two images on top of each other, so we're going to need to
  // read them back in as image
  // Draw the first image onto the design canvas
  designCtx.drawImage(firstImage, 0, 0, pageSize.width, pageSize.height)

  // Now we want to set the compositing mode to screen
  designCtx.globalCompositeOperation = 'screen'
  // Now fill the canvas with the first colour
  designCtx.fillStyle = firstColour
  designCtx.fillRect(0, 0, pageSize.width, pageSize.height)

  // Save the design canvas as preview.png
  buffer = await designCanvas.toBuffer()
  fs.writeFileSync(path.join(__dirname, '01 colour one preview.png'), buffer)

  // Now that we've saved it, we want to draw
  // the second image
  // So start with source-over and put the image in
  designCtx.globalCompositeOperation = 'source-over'
  designCtx.drawImage(secondImage, 0, 0, pageSize.width, pageSize.height)
  // Now set the compositing mode to screen
  designCtx.globalCompositeOperation = 'screen'
  // Now fill the canvas with the second colour
  designCtx.fillStyle = secondColour
  designCtx.fillRect(0, 0, pageSize.width, pageSize.height)
  // Save the design canvas
  buffer = await designCanvas.toBuffer()
  fs.writeFileSync(path.join(__dirname, '02 colour two preview.png'), buffer)

  designCtx.globalCompositeOperation = 'source-over'
  designCtx.drawImage(await loadImage(path.join(__dirname, '01 colour one preview.png')), 0, 0, pageSize.width, pageSize.height)
  designCtx.globalCompositeOperation = 'multiply'
  designCtx.drawImage(await loadImage(path.join(__dirname, '02 colour two preview.png')), 0, 0, pageSize.width, pageSize.height)

  // Save the design canvas as preview.png
  buffer = await designCanvas.toBuffer()
  fs.writeFileSync(path.join(__dirname, 'preview.png'), buffer)
}

const screen = async () => {
  await main()
}

screen()
