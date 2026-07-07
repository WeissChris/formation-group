// The Client Introduction Pack sent on job-planning day. CONTENT (welcome copy, service promise,
// process steps, team roster) lives here as editable defaults; the per-project pack stores only the
// overrides + the auto-filled client/date fields, and the roster is a shared company record so
// "edit once" flows to every future pack. Mirrors the OPC document pattern.

// ── Team roster (company-wide, editable in one place) ─────────────────────────

export interface TeamMember {
  id: string
  name: string
  role: string
  bio: string
  photo?: string          // /intro/team-*.png or an uploaded URL
  group: 'manager' | 'foreman' | 'landscaper'
}

export interface CompanyContact { role: string; name: string; phone: string; email: string; pool?: boolean }

export interface IntroRoster {
  members: TeamMember[]
  contacts: CompanyContact[]   // the contact-details block (managers); pool:true rows hidden on no-pool jobs
  updatedAt?: string
}

// Seeded from Formation's introduction pack. Editable via the roster editor; photos map to the
// bundled brand images.
export const DEFAULT_ROSTER: IntroRoster = {
  contacts: [
    { role: 'Pool Construction Manager', name: 'Ryan', phone: '0402 983 787', email: 'ryan@formationlandscapes.com.au', pool: true },
  ],
  members: [
    { id: 'drew', name: 'Drew', role: 'Landscape Construction Manager', group: 'manager', photo: '/intro/team-drew.png',
      bio: "Meet Drew, a devoted father who cherishes moments spent with his two girls, his partner Kat and daughter Penny. He's an avid sports enthusiast, with a particular passion for footy (North Melbourne), football (Everton) and cricket. Beyond sports and all things intricate landscaping, he harbours a deep desire to travel and explore all the world has to offer." },
    { id: 'ryan', name: 'Ryan', role: 'Pool Construction Manager', group: 'manager', photo: '/intro/team-ryan.png',
      bio: "Meet Ryan, an adventurous individual who has a real passion for travel. When he's not traversing the globe or building pools, he treasures moments spent with his wife, Casey and two young children, Jax and Mia, or catching up with close mates for fishing outings or leisurely beers." },
    { id: 'serge', name: 'Serge', role: 'Project Foreman', group: 'foreman', photo: '/intro/team-serge.png',
      bio: "Introducing Serge, a connoisseur of culinary delights who finds joy in both baking and indulging in scrumptious treats, with a particular weakness for lemon meringue. When not in the kitchen or crafting on site, he's on the field, coaching his son's junior rugby team, imparting not only the skills of the game but also valuable life lessons." },
    { id: 'mike', name: 'Mike', role: 'Project Foreman', group: 'foreman', photo: '/intro/team-mike.png',
      bio: "Meet Mike, a dedicated sports enthusiast with a strong passion for teams like Collingwood and Manchester United. When he's not cheering on his favourite teams or landscaping, he enjoys spending quality time with his partner Belinda and their beloved dog Rufus. Recently he's also ventured into the world of golf, embracing all the challenge and frustration the game has to offer." },
    { id: 'cam', name: 'Cam', role: 'Project Foreman', group: 'foreman', photo: '/intro/team-cam.png',
      bio: "Meet Cam, a vibrant individual with a passion for both recreation and creativity. Sunday nights are reserved for spirited basketball games with his closest mates. Beyond the court and all things landscaping, he delights in the culinary arts, showcasing his talent through his signature dish, burnt butter prawns." },
    { id: 'steven', name: 'Steven', role: 'Project Foreman', group: 'foreman', photo: '/intro/team-steven.png',
      bio: "Introducing Steven, who off the field is either out pounding the pavement training for his next half or full marathon, or spending quality time with his partner George. With strong family values at his core and a love for keeping fit, Steven brings dedication and heart to everything he does." },
    { id: 'charlie', name: 'Charlie', role: 'Qualified Landscaper', group: 'landscaper', photo: '/intro/team-charlie.png',
      bio: "Meet Charlie, a warm individual with a love for both culinary adventures and quality family time. He finds joy in the art of smoking meat, with a particular fondness for pork shoulder. When he's not perfecting his barbecue skills or landscaping, he treasures moments with his partner Meg and their toddler Sunny." },
    { id: 'nath', name: 'Nath', role: 'Qualified Landscaper', group: 'landscaper', photo: '/intro/team-nath.png',
      bio: "Introducing Nath, a dynamic individual whose life revolves around the water. When he isn't landscaping, he finds flow and solace surfing or swimming. Beyond the waves, Nath embraces his musical side as a dedicated bassist in a band." },
    { id: 'lucas', name: 'Lucas', role: 'Apprentice Landscaper', group: 'landscaper', photo: '/intro/team-lucas.png',
      bio: "Meet Lucas, an energetic guy whose love for supporting his friends and family is evident in his work. In his spare time he enjoys playing guitar and doing landscape work in his own garden. He follows Geelong in the footy and enjoys being outside making the most of what life has to offer." },
    { id: 'james', name: 'James', role: 'Apprentice Landscaper', group: 'landscaper', photo: '/intro/team-james.png',
      bio: "Meet James — when he's not on site he's lacing up the boots for a game of footy or catching up with his mates. And while he does support Carlton (we try not to hold it against him), his skill and dedication on the job more than make up for it." },
  ],
}

// ── Process steps (editable defaults) ─────────────────────────────────────────

export interface ProcessStep { title: string; body: string }

export const LANDSCAPE_PROCESS: ProcessStep[] = [
  { title: 'Planning', body: 'Formation is an end-to-end service. Instead of handing the design concept over to a third-party construction team, we brief our talented in-house construction team and work with them throughout the project. By retaining the full range of construction capabilities in-house we maintain our quality of service and outcome, and reduce the risk of errors in execution. We coordinate engineering, permits, building surveyors and all third-party consultants required to realise the plan, then spend several days project planning - from timeline to Gantt chart - to ensure delivery on budget and on time.' },
  { title: 'Site Preparation', body: 'Before initiating any work on your site, your Foreman conducts a thorough site inspection and briefs the team on the project plan. If demolition is necessary it commences following this inspection, during which we prioritise securing proper access and protecting all on-site assets. This careful preparation ensures a smooth transition into construction, minimising disruptions and ensuring the safety and security of your property.' },
  { title: 'Set Out', body: 'Before breaking ground, our team meticulously maps out the designated area using pegs and markers, establishing precise boundaries and heights for the upcoming construction phase. This attention to detail lays the groundwork for a smooth and accurate execution, ensuring every element is placed with precision and care.' },
  { title: 'Ground Works', body: 'Once set out is complete we turn to constructing a solid foundation, which often involves meticulous site cut and excavation, laying sturdy footings, and implementing effective drainage systems. These elements ensure stability, structural integrity and protection against water damage for the entire project.' },
  { title: 'Hard Landscaping', body: 'The focus shifts to the hard landscaping phase - paving and paving slabs, in-situ and exposed aggregate concrete, brick and blockwork. It also involves the installation of decking, pergolas, timber screening and other carpentry work, plus retaining walls and rockwork to add structure and visual appeal. Each component contributes to a functional and aesthetically pleasing environment.' },
  { title: 'Soft Landscaping', body: 'The focus turns to the elements that enrich the space: garden edging to define borders, fresh soil to nourish plantings, and thoughtfully arranged flora. Mulching retains moisture and suppresses weeds, while instant and synthetic turf provide lush greenery with minimal maintenance - completing the transformation of the outdoor area.' },
  { title: 'Irrigation', body: 'The next critical phase is irrigation implementation to maintain the garden’s health and vitality.' },
  { title: 'Lighting', body: 'Lighting is the finishing touch for your outdoor space, enhancing its functionality and ambiance so it can be enjoyed during both daylight and night.' },
  { title: 'Handover', body: 'Finally, we thoroughly clean the space to ensure a pristine finish and present the completed job to you. We pride ourselves on the end-to-end experience and are committed to ensuring your delight and satisfaction at final handover.' },
]

export const POOL_PROCESS: ProcessStep[] = [
  { title: 'Planning', body: 'Each pool is planned and built following our thorough step-by-step process, ensuring the result is of the highest quality and meets all safety standards. Your pool design is handed to our in-house pool construction team, who work closely with the principal designer throughout. We coordinate engineering, permits, building surveyors and all third-party consultants, then spend several days project planning - from timeline to Gantt chart - to ensure delivery on budget and on time.' },
  { title: 'Set Out', body: 'Before construction begins we carefully place pegs and markers to outline the boundaries with precision and set the exact heights for the building phase. Establishing these parameters upfront ensures accuracy and alignment throughout, laying a solid foundation for the creation of your pool area.' },
  { title: 'Excavation', body: 'Within a timeframe of 1 to 4 days we carefully conduct the excavation, taking into account access specifics and tailoring machinery dimensions to suit the pool. During this phase we incorporate screenings, essential for pool drainage, and integrate the pool steel reinforcement into the process.' },
  { title: 'Steel Fixings', body: 'Our skilled steel fixers initiate the construction of the structural shell, with completion timelines ranging from 2 to 10 days depending on the size and design intricacies of the pool.' },
  { title: 'Internal Plumbing', body: 'After incorporating all plumbing work we organise the obligatory steel inspection. This critical step ensures the structural integrity of the pool meets regulatory standards and safety requirements.' },
  { title: 'Concrete Spray', body: 'A team of seasoned concreters, using a tailor-made pool concrete mix, craft the contours of your pool shell by hand. We then revisit the site to remove any boxing or steel that supported the initial spray, ensuring a flawless finish to your pool’s structure.' },
  { title: 'Pool Tiling', body: 'After selecting your pool tiles and allowing the shell to cure for a minimum of 28 days, our tilers render the pool and commence the tile application. Tiles are installed before coping and paving.' },
  { title: 'Equipment Installation', body: 'Each component of your pool equipment is meticulously set up, calibrated and integrated to work in harmony, delivering a system that meets and exceeds industry standards.' },
  { title: 'Fence Inspection', body: 'After installing the pool fences, a final inspection by our surveyor is arranged to ensure compliance before pool filling.' },
  { title: 'Filling the Pool', body: 'Before filling we conduct an acid wash on the tiles to ensure pristine cleanliness. During filling we actively monitor progress, ensuring a controlled introduction of water, then add the essential chemicals to balance the water and commission the equipment - guaranteeing a pool that is visually appealing, chemically balanced and ready for optimal performance.' },
  { title: 'Handover', body: 'The handover involves detailed step-by-step instructions on how to operate your pool equipment and addressing any questions you may have. Even though this marks the final stage, we remain readily available should you have further questions - your satisfaction and peace of mind are our ongoing priorities.' },
]

// ── Per-project pack data (overrides + auto-filled fields) ────────────────────

export interface IntroPackData {
  welcomeGreeting?: string    // "Steve & Cas," - defaults to client name(s)
  welcomeBody?: string        // the thank-you letter (editable default)
  foremanName?: string        // Job Foreman contact - defaults to the assigned supervisor
  foremanPhone?: string
  foremanEmail?: string
  servicePromise?: string     // Our Service Promise copy
  serviceQuote?: string       // testimonial under the service promise
  startDate?: string          // ISO; defaults from the Gantt first bar
  completionDate?: string     // ISO; defaults from the Gantt last bar
  includePool?: boolean       // override; defaults from the project type
  landscapeSteps?: ProcessStep[]   // override of LANDSCAPE_PROCESS
  poolSteps?: ProcessStep[]        // override of POOL_PROCESS
  sentAt?: string                  // ISO - stamped when the foreman marks the pack sent to the client
  sentBy?: string
}

export const DEFAULT_WELCOME_BODY =
  'Thank you for choosing Formation to turn your dream outdoor space into a reality. We are thrilled to be working with you. This is a short introduction pack to provide some general information about your job and the process, to introduce your team, and to share their key contact details.'

export const DEFAULT_SERVICE_PROMISE =
  'One of our core four values at Formation is service. We are fully committed to ensuring a transparent and enjoyable process from end to end. As such, we provide weekly updates via email to keep you well informed on the progress of your job, as well as being on site for incidental discussions.'

export const DEFAULT_SERVICE_QUOTE =
  '“The communication was the best I have ever experienced from any trade.” — Nicole Marsden, Homeowner'

export const COMPANY = {
  phone: '(03) 9044 7910',
  email: 'info@formationlandscapes.com.au',
  web: 'formationlandscapes.com.au',
}
