// English versions of the guides, keyed by the Swedish slug in guides.mjs.
export const GUIDES_EN = {
  'powerbank-pa-flyget': {
    slug: 'power-bank-on-a-plane',
    title: 'Power banks on planes – rules and tips',
    desc: 'Can you take a power bank on a plane? How to work out watt-hours, what applies in hand luggage and what to check with your airline.',
    kicker: 'Travel',
    sections: [
      ['Short answer', ['Power banks go in your hand luggage – never in checked baggage. Under 100 Wh is allowed by most airlines. Between 100 and 160 Wh usually needs the airline’s approval, and over 160 Wh is not allowed at all.']],
      ['How to work out watt-hours', [
        'Capacity is usually printed in mAh. You get watt-hours like this: mAh × voltage ÷ 1,000. The cells are almost always 3.6 or 3.7 V.',
        'Example: 20,000 mAh × 3.7 V ÷ 1,000 = 74 Wh. That is under the 100 Wh limit. Often the watt-hours are printed on the power bank too.',
      ]],
      ['Check your airline’s own rules', ['Several airlines have introduced their own rules, for example that you may not use or charge a power bank during the flight, or that it must stay visible rather than in the overhead locker. Always read your airline’s current rules before you travel.']],
      ['Tips before your trip', [
        'Charge the power bank at home so you don’t have to hunt for sockets at the airport.',
        'Protect the ports, for example in a separate pocket, so no metal objects can short them.',
        'Bring a short cable that supports fast charging – it saves space.',
      ]],
    ],
  },
  'hur-manga-watt-laddare': {
    slug: 'how-many-watts-charger',
    title: 'How many watts does your charger need?',
    desc: 'Phone, tablet or laptop – how to know what power your charger needs, why the cable matters and whether a bigger charger is dangerous.',
    kicker: 'Charging',
    sections: [
      ['Short answer', ['Most phones are fine with 20–45 W. Tablets and thin laptops often want 30–65 W, and larger laptops 90 W or more. A 65 W charger therefore covers phones, tablets and many laptops.']],
      ['Is a more powerful charger dangerous?', ['No, not with USB-C Power Delivery. The charger and the device agree on how much power to deliver, so your phone only takes what it can handle. A charger that is too weak is the problem – then the device charges slowly, or not at all while in use.']],
      ['Check what your device needs', ['Look at the original charger or the manufacturer’s specifications. If your laptop’s charger says 90 W, it will charge more slowly on 65 W, especially under heavy load.']],
      ['The cable matters too', ['A standard USB-C cable handles 60 W (3 A). For more than that you need a cable rated for 5 A – 100 W, or 240 W for the newest chargers.']],
      ['Multiple ports share the power', ['A charger with several ports usually states the total power. If you charge two things at once, each port gets less. Manufacturers usually show how the power is split.']],
    ],
  },
  'sa-skapar-du-en-tavelvagg': {
    slug: 'how-to-create-a-gallery-wall',
    title: 'How to create a gallery wall',
    desc: 'Step by step: plan, pick frames, measure spacing and hang a gallery wall that looks considered – without unnecessary holes.',
    kicker: 'Home & decor',
    sections: [
      ['1. Choose a common thread', ['A gallery wall looks calm when something repeats: the same frame colour, the same colour palette in the images or the same type of pictures. Pick one larger piece as an eye-catcher and build around it.']],
      ['2. Plan on the floor', ['Lay the frames out on the floor and move them around until you’re happy. Take a photo so you remember the arrangement.']],
      ['3. Make paper templates', ['Cut out paper the same size as the frames and stick them to the wall with masking tape. You see the whole layout and can mark where the nail or hook goes before you drill.']],
      ['4. Spacing and height', ['Keep the same spacing between frames, often 5–8 cm. Let the centre of the whole group sit around 145–155 cm from the floor, or adapt it to the furniture below.']],
      ['5. Hang it properly', ['Use a spirit level. Choose hooks or plugs for your wall type and the frame’s weight. If you rent and can’t drill, there are adhesive strips for pictures – check how much they can hold.']],
    ],
  },
  'ergonomi-hemmakontoret': {
    slug: 'home-office-ergonomics',
    title: 'Home office ergonomics – on a budget',
    desc: 'Simple adjustments that make working at the kitchen table or desk more comfortable: screen height, keyboard, light and breaks.',
    kicker: 'Computer & office',
    sections: [
      ['Screen at eye level', ['The top of the screen should be roughly at eye level or just below, with the screen an arm’s length away. With a laptop, a laptop stand is the easiest fix.']],
      ['Separate keyboard and mouse', ['When the laptop sits high, the keyboard is too high. A separate keyboard and mouse let your shoulders drop and your elbows sit at roughly a right angle.']],
      ['Chair and feet', ['Your feet should reach the floor or a footrest, and your back should be supported. A cushion in the small of your back can help on an ordinary kitchen chair.']],
      ['Light without reflections', ['Place the screen so the window is to the side, not behind or in front of it. That avoids reflections and glare. In video calls you look best with light from the front.']],
      ['Move', ['The best posture is the next one. Get up and move for a while every hour. If you have pain that doesn’t go away, it’s wise to talk to a healthcare professional or an ergonomist.']],
    ],
  },
  'mysbelysning-vintermorkret': {
    slug: 'cosy-lighting-for-dark-winters',
    title: 'Cosy lighting for dark winters',
    desc: 'How to layer your lighting, choose the right colour temperature and use smart bulbs and LED candles for a warm, inviting home.',
    kicker: 'Home & decor',
    sections: [
      ['Layered lighting', ['A room feels cosy with several light sources at different heights: general lighting, lamps where you read or cook, and mood lighting like window lamps and candles. A single ceiling light gives harsh, flat light.']],
      ['Warm white light', ['Colour temperature is measured in kelvin. Around 2,700 K gives a warm, yellowish glow that suits living rooms and bedrooms. Higher values, 4,000 K and up, give a cooler light that suits workspaces.']],
      ['Dim and schedule', ['With smart or dimmable bulbs you can lower the light in the evening. A schedule that switches on the window lamps when it gets dark means your home greets you lit up.']],
      ['LED candles instead of real ones', ['Flameless LED candles give the same cosy glow without fire risk – great in windows, with kids and with pets. Many have timers, so they light up by themselves every evening.']],
    ],
  },
};
