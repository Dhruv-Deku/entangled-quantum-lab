import { lab } from '../lab/instance';
import { Campaign } from './campaign';

/** The one campaign, driving the shared lab. */
export const campaign = new Campaign(lab);
