/**
 * Personal web-voter links. The bot hands each curator a magic link that opens
 * the web app already signed in as them (bigger card images than in-chat), with
 * votes still attributed to their real Telegram identity + segment.
 */
import { config } from '../config.js'
import * as repo from '../db/repo.js'

export function webVoteUrl(curatorId: number): string {
  const token = repo.getOrCreateCuratorWebToken(curatorId)
  return `${config.webUrl}/#vote?t=${encodeURIComponent(token)}`
}
