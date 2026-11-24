import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {Theme} from '@astryxdesign/core/theme';
import {milemarkTheme} from '../theme-built/milemark.js';
import {normalizeActivity} from '../activities';
import {DEFAULT_PROFILE} from '../data';
import {DataView} from './DataView';
const activity=normalizeActivity({id:42,name:'A real recorded run',start_date:'2026-11-23T01:00:00Z',distance:5000,moving_time:1800,sport_type:'Run'});
describe('live dashboard rendering',()=>{
 it('renders missing sensors honestly instead of crashing or displaying fabricated values',()=>{
  const markup=renderToStaticMarkup(<Theme theme={milemarkTheme} mode="light"><DataView activities={[activity]} connection="demo" live today="2026-11-24" fetching={false} lastUpdated="now" refresh={()=>{}} onConnect={()=>{}} onAnalysis={()=>{}} profile={DEFAULT_PROFILE}/></Theme>);
  expect(markup).toContain('A real recorded run');expect(markup).toContain('Cadence unavailable');expect(markup).toContain('No recorded data');expect(markup).toContain('Route unavailable');expect(markup).not.toContain('undefined');expect(markup).not.toContain('CUBBON PARK');expect(markup).not.toContain('Synthetic data only');
 });
 it('uses a projected recorded GPS trace and escapes activity titles',()=>{
  const row=normalizeActivity({id:42,name:'<script>unsafe</script>',start_date:'2026-11-23T01:00:00Z',distance:5000,moving_time:1800,sport_type:'Run'},{time:{data:[0,10]},distance:{data:[0,30]},latlng:{data:[[12.9,77.5],[12.91,77.51]]}});
  const markup=renderToStaticMarkup(<Theme theme={milemarkTheme} mode="dark"><DataView activities={[row]} connection="demo" live today="2026-11-24" fetching={false} lastUpdated="now" refresh={()=>{}} onConnect={()=>{}} onAnalysis={()=>{}} profile={DEFAULT_PROFILE}/></Theme>);
  expect(markup).toContain('Recorded GPS trace');expect(markup).not.toContain('<script>unsafe');expect(markup).toContain('&lt;script&gt;');expect(markup).not.toContain('CUBBON PARK');
 });
});
