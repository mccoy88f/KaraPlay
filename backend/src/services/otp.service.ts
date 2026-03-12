import { randomInt } from 'crypto'

export const otpService = {
  generate(): string {
    return String(randomInt(100000, 999999))
  },
}
