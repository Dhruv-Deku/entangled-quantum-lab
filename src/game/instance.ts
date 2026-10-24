import { lab } from '../lab/instance';
import { Campaign } from './campaign';
import { CHAPTERS } from './chapters';
import { COURSE } from './course';
import { dailyChapter } from './daily';
import { LESSONS } from './lessons';
import { PUZZLES } from './puzzles';

/** The one campaign, driving the shared lab. Today's daily challenge closes the Puzzles tab. */
export const campaign = new Campaign(lab, CHAPTERS, LESSONS, [...PUZZLES, dailyChapter()], COURSE);
