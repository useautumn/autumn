import { AnalyticsService } from '@/internal/analytics/AnalyticsService.js';
import { ExtendedRequest } from '@/utils/models/Request.js';
import { routeHandler } from '@/utils/routerUtils.js';
import { Router } from 'express';

const trmnlRouter = Router();

trmnlRouter.post('/screen', async (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: 'generate trmnl screen',
		handler: async () => {
			const { db, org, env, features } = req;

			console.log('req.body', req.body);
            console.log('req.body.event_name', req.body.event_name);
            console.log('req.body.interval', req.body.interval);

            let topUser = await AnalyticsService.getTopUser({ req });
            let totalEvents = await AnalyticsService.getTotalEvents({ req });
            let dailyActiveCustomers = await AnalyticsService.dailyActiveCustomers({ req });

			let results = await AnalyticsService.getTimeseriesEvents({
				req,
				params: {
					event_names: [req.body.event_name],
					interval: req.body.interval,
				},
                aggregateAll: true,
			});

			console.log('results', results);

			let template = (data: any) => `
<div class='view view--full'>
  <div class='layout layout--col gap--space-between'>
    <div class='grid grid--cols-3'>
      <div class='item'>
        <div class='meta'></div>
        <div class='content'>
          <span class='value value--tnums' data-value-fit='true'>${totalEvents || 0}</span>
          <span class='label'>Total Events Today</span>
        </div>
      </div>
      <div class='item'>
        <div class='meta'></div>
        <div class='content'>
          <span class='value value--tnums' data-value-fit='true'>${topUser.name || "Unknown"}</span>
          <span class='label'>Most Active User</span>
        </div>
      </div>
      <div class='item'>
        <div class='meta'></div>
        <div class='content'>
          <span class='value value--tnums' data-value-fit='true'>${dailyActiveCustomers || 0}</span>
          <span class='label'>Customers Active Today</span>
        </div>
      </div>
    </div>

    <div id='chart-123' style='width: 100%'></div>
  </div>

  <div class='title_bar'>
    <img class='image' src='https://cdn.discordapp.com/emojis/1387133701393223680.webp?size=96' />
    <span class='title'>Autumn</span>
    <span class='instance'>atmn.sh</span>
  </div>

  <script type='text/javascript'>
  var data = [${data.data.map((row: any) => `['${row.period}', ${row[req.body.event_name + '_count']}]`).join(',')}];
  
  var createChart = function() {
    new Chartkick['LineChart'](
    'chart-123',
    data,
    {
      adapter: 'highcharts', // chartjs, google, etc available
      prefix: '',
      thousands: ',',
      points: false,
      colors: ['black'],
      curve: true,
      library: {
        chart: {
          height: 260
        },
        plotOptions: {
          series: {
            animation: false,
            lineWidth: 4
          }
        },
        yAxis: {
          labels: {
            style: {
              fontSize: '16px',
              color:'#000000'
            }
          },
          gridLineDashStyle: 'shortdot',
          gridLineWidth: 1,
          gridLineColor: '#000000',
          tickAmount: 5
        },
        xAxis: {
          type: 'datetime',
          labels: {
            style: {
              fontSize: '16px',
              color: '#000000'
            }
          },
          lineWidth: 0,
          gridLineDashStyle: 'dot',
          tickWidth: 1,
          tickLength: 0,
          gridLineWidth: 1,
          gridLineColor: '#000000',
          tickPixelInterval: 120
        }
      }
    });
  };

  if ('Chartkick' in window) {
    createChart();
  } else {
    window.addEventListener('chartkick:load', createChart, true);
  }
</script>
  </div>
`;
            console.log("template", template(results));
			res.status(200).json({ markup: template(results).replace(/\n/g, '') });
		},
	})
);

export { trmnlRouter };
