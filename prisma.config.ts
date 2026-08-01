import * as fs from 'fs'
import { defineConfig } from 'prisma/config'

// Prisma config files do not automatically load .env.
try {
  const envFile = fs.readFileSync('.env', 'utf-8')
  envFile.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/)
    if (match) {
      const key = match[1]
      let value = match[2] || ''
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1)
      process.env[key] = value
    }
  })
} catch {
  // .env file not found — DATABASE_URL should be set via system env
}

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to load the Prisma configuration')
}

export default defineConfig({
  engine: 'classic',
  datasource: {
    url: databaseUrl,
  },
})
