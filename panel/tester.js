(function () {

function _escape(html) {
  return String(html)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function _clean(str) {
  str = str
    .replace(/\r\n?|[\n\u2028\u2029]/g, "\n").replace(/^\uFEFF/, '')
    .replace(/^function *\(.*\)\s*{|\(.*\) *=> *{?/, '')
    .replace(/\s+\}$/, '');

  var spaces = str.match(/^\n?( *)/)[1].length,
      tabs = str.match(/^\n?(\t*)/)[1].length,
      re = new RegExp('^\n?' + (tabs ? '\t' : ' ') + '{' + (tabs ? tabs : spaces) + '}', 'gm');

  str = str.replace(re, '');

  // trim
  return str.replace(/^\s+|\s+$/g, '');
}

function _fragment(html) {
    var args = arguments,
        div = document.createElement('div'),
        i = 1;

    div.innerHTML = html.replace(/%([se])/g, function(_, type){
        switch (type) {
            case 's': return String(args[i++]);
            case 'e': return _escape(args[i++]);
        }
    });

    return div.firstChild;
}

function _makeUrl(s) {
    var search = window.location.search;

    // Remove previous grep query parameter if present
    if (search) {
        search = search.replace(/[?&]grep=[^&\s]*/g, '').replace(/^&/, '?');
    }

    return window.location.pathname + (search ? search + '&' : '?' ) + 'grep=' + encodeURIComponent(s);
}

function _createPassEL ( test ) {
    return _fragment('<li class="test pass %e"><h2>%e<span class="duration">%ems</span></h2></li>',
                     test.speed, test.title, test.duration);
}

function _createPendingEL ( test ) {
    return _fragment('<li class="test pass pending"><h2>%e</h2></li>', test.title);
}

function _createFailEL ( test, err ) {
    var el = _fragment('<li class="test fail"><h2>%e</h2></li>', test.title, _makeUrl(test.fullTitle));
    var errText = err.stack;

    // FF / Opera do not add the message
    if ( !~errText.indexOf(err.message) ) {
        errText = err.message + '\n' + errText;
    }

    // <=IE7 stringifies to [Object Error]. Since it can be overloaded, we
    // check for the result of the stringifying.
    if ('[object Error]' === errText) errText = err.message;

    Polymer.dom(el).appendChild(_fragment('<pre class="error">%e</pre>', errText));
    return el;
}

//
Editor.registerPanel( 'tester.panel', {
    is: 'editor-tester',

    properties: {
    },

    ready: function () {
        this.reset();
        // this.run( 'packages://tester/test/simple.html' ); // TODO
        this.run( 'packages://console/test/console.html' ); // TODO

        this._ipcListener = new Editor.IpcListener();
    },

    'panel:out-of-date': function ( panelID ) {
        this.reset();
        this.$.runner.reload();
    },

    reset: function () {
        this.passes = 0;
        this.failures = 0;
        this.duration = 0;
        this.progress = 0;

        var mochaReportEL = this.$['mocha-report'];
        while ( mochaReportEL.children.length ) {
            mochaReportEL.firstChild.remove();
        }
        this.stack = [mochaReportEL];
    },

    run: function ( url ) {
        this.$.runner.src = Editor.url(url);
    },

    _proxyIpc: function () {
        this.$.runner.send.apply(this.$.runner,arguments);
    },

    _onRunnerConsole: function ( event ) {
        switch ( event.level ) {
        case 0:
            console.log('[runner-console]: ', event.message);
            break;

        case 1:
            console.warn('[runner-console]: ', event.message);
            break;

        case 2:
            console.error('[runner-console]: ', event.message);
            break;
        }
    },

    _onRunnerIpc: function ( event ) {
        var stats, suite, test, err, errText, el;

        switch ( event.channel ) {
        case 'tester:send':
            this._proxyIpc.apply(this,event.args);
            break;

        case 'runner:start':
            console.log('runner start');
            break;

        case 'runner:suite':
            suite = event.args[0];

            if ( suite.root ) return;

            // suite
            el = _fragment('<li class="suite"><h1><a>%s</a></h1></li>', _escape(suite.title));

            // container
            Polymer.dom(this.stack[0]).appendChild(el);
            this.stack.unshift(document.createElement('ul'));
            Polymer.dom(el).appendChild(this.stack[0]);

            break;

        case 'runner:suite-end':
            suite = event.args[0];

            if ( suite.root ) return;

            this.stack.shift();

            break;

        case 'runner:test':
            break;

        case 'runner:test-end':
            stats = event.args[0];
            test = event.args[1];
            this.passes = stats.passes;
            this.failures = stats.failures;
            this.duration = (stats.duration / 1000).toFixed(2);
            this.progress = stats.progress;

            // test
            if ( test.state === 'passed' ) {
                el = _createPassEL(test);
            } else if (test.pending) {
                el = _createPendingEL(test);
            } else {
                el = _createFailEL(test, test.err);
            }

            // toggle code
            // TODO: defer
            if (!test.pending) {
                var h2 = el.getElementsByTagName('h2')[0];

                h2.addEventListener( 'click', function () {
                    pre.style.display = 'none' == pre.style.display ? 'block' : 'none';
                });

                var pre = _fragment('<pre><code>%e</code></pre>', _clean(test.fn));
                Polymer.dom(el).appendChild(pre);
                pre.style.display = 'none';
            }

            // Don't call .appendChild if #mocha-report was already .shift()'ed off the stack.
            if (this.stack[0]) Polymer.dom(this.stack[0]).appendChild(el);

            break;

        case 'runner:pending':
            break;

        case 'runner:pass':
            break;

        case 'runner:fail':
            test = event.args[0];
            err = event.args[1];

            el = _createFailEL(test, err);

            // Don't call .appendChild if #mocha-report was already .shift()'ed off the stack.
            if (this.stack[0]) Polymer.dom(this.stack[0]).appendChild(el);

            break;

        case 'runner:end':
            console.log('runner finish');
            break;
        }
    },
});

})();
