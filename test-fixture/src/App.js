import Button from '@/components/Button'; // Working Alias
import Missing from '@/components/Missing'; // Broken Alias (Should Error)

import './index.html'; // Working Relative
import './missing.css'; // Broken Relative (Should Error)

console.log(Button);
